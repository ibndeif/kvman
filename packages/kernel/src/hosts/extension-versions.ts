import { manifestSchema, type Capabilities, type KernelErrorCode, type Manifest, type Problem, type QuarantineReason } from '@kvman/protocol';
import type { FaultPoints } from '../faults/fault-points.ts';
import type { SnapshotStore } from '../install/snapshot-store.ts';
import { configProblem, covers, readMigrating, storedDataVersion, type DataMigrations } from '../migrations/data-migrations.ts';
import { kernelProblem, type ProblemContext } from '../problems.ts';
import type { RegistryState } from '../registry/registry-state.ts';
import type { Claim } from '../scheduler/dispatcher.ts';
import type { Scheduler } from '../scheduler/scheduler.ts';
import type { CommitPipeline } from '../storage/commit-pipeline.ts';
import type { CommitUnit } from '../storage/commit-unit.ts';
import type { Connection } from '../storage/driver.ts';
import type { VersionChange } from '../storage/version-changes.ts';
import type { KernelCommits } from './kernel-commits.ts';
import { prunedGrant } from '../registry/grant-validity.ts';
import { capabilityPlan, changedSchedules, mostIsolated, referentialIssues } from './reload-checks.ts';

// 06 §6.6 steps 3 and 5: running invocations get 10 s to finish, and so do those on a shared worker being replaced.
export const reloadGraceMs = 10_000;

export type ReloadHosts = { drainExtension(extension: string, graceMs: number): Promise<void>; replaceHosts(extension: string, graceMs: number): void };

export type ExtensionVersionsDeps = {
  connection: Connection;
  pipeline: CommitPipeline;
  commits: KernelCommits;
  registry: RegistryState;
  snapshots: SnapshotStore;
  migrations: DataMigrations;
  hosts: ReloadHosts;
  scheduler: Scheduler;
  faults: FaultPoints;
  quarantine: (extension: string, reason: QuarantineReason) => Promise<void>;
};

export type ReloadRequest = { name: string; digest?: string; grants?: Record<string, Capabilities> };

// A command's reload replies in its swap unit; a kernel's own (the upgrade boot) has no claim. `settled` says the
// claim already has its outcome.
export type ReloadContext = { correlationId: string; claim?: Claim };

export type ReloadOutcome = { ok: true; digest: string } | { ok: false; problem: Problem; settled: boolean };

type InstalledVersion = { source: string; integrity?: string; manifest: Manifest };

type Swap = Omit<Extract<VersionChange, { kind: 'extension.swap' }>, 'kind'>;

export function readInstalledVersion(connection: Connection, name: string, digest: string): InstalledVersion | undefined {
  const row = connection.prepare('SELECT source, integrity, manifest FROM extension_versions WHERE name = ? AND digest = ?').get(name, digest);
  if (row === undefined) return undefined;
  const integrity = row['integrity'];
  return { source: String(row['source']), ...(typeof integrity === 'string' ? { integrity } : {}), manifest: manifestSchema.parse(JSON.parse(String(row['manifest']))) };
}

export function activeDigestOf(connection: Connection, name: string): string | undefined {
  const digest = connection.prepare('SELECT active_digest FROM extensions WHERE name = ?').get(name)?.['active_digest'];
  return typeof digest === 'string' ? digest : undefined;
}

// 06 §6.6–§6.7, ADRs 0142–0145: reload, upgrade, and rollback. Any failure leaves the previous version active.
export class ExtensionVersions {
  readonly #deps: ExtensionVersionsDeps;

  constructor(deps: ExtensionVersionsDeps) {
    this.#deps = deps;
  }

  async reload(request: ReloadRequest, context: ReloadContext): Promise<ReloadOutcome> {
    const { connection, registry } = this.#deps;
    const refused = (code: KernelErrorCode, options: Omit<ProblemContext, 'correlationId'>): ReloadOutcome => ({ ok: false, problem: this.#problem(code, context, options), settled: false });
    const { name } = request;
    const active = activeDigestOf(connection, name);
    if (active === undefined) return refused('NOT_FOUND', { detail: `no extension ${name} is installed` });
    const digest = request.digest ?? active;
    if (this.#redeliveredAfterSwap(request, context, digest === active)) {
      await this.#deps.commits.reply(context.claim, { digest });
      return { ok: true, digest };
    }
    const version = readInstalledVersion(connection, name, digest);
    if (version === undefined) return refused('NOT_FOUND', { detail: `${name} has no installed version with the digest ${digest}` });
    const snapshot = await this.#deps.snapshots.verifyDigest(name, digest);
    if (snapshot === undefined) {
      if (digest === active) await this.#deps.quarantine(name, 'EXT_INTEGRITY');
      return refused('EXT_INTEGRITY', { detail: `the snapshot ${digest} of ${name} does not match its digest` });
    }
    const { manifest } = version;
    const stored = storedDataVersion(connection, name);
    if (stored !== undefined && stored > manifest.data.version && !covers(manifest, stored)) {
      return refused('EXT_ROLLBACK_BLOCKED', { detail: `the stored data is at version ${stored}, which version ${manifest.meta.version} (data version ${manifest.data.version}) cannot run on`, params: { stored, target: manifest.data.version } });
    }
    const current = registry.current();
    const enabled = new Map([...registry.enabled()].flatMap(([workspaceId, names]) => {
      const granted = names.includes(name) ? registry.capabilities(name, workspaceId) : undefined;
      return granted === undefined ? [] : [[workspaceId, granted] as const];
    }));
    const integrity = version.integrity === undefined ? {} : { integrity: version.integrity };
    const swap = {
      name, version: { digest, source: version.source, ...integrity, namespace: manifest.meta.namespace, dataVersion: manifest.data.version }, cancelSchedules: changedSchedules(current.manifestOf(name), manifest),
    };
    if (enabled.size === 0) return this.#swap({ ...swap, grants: {}, reloaded: [] }, context);
    const issues = referentialIssues(current, manifest, [...enabled.keys()]);
    if (issues.length > 0) return refused('VALIDATION_FAILED', { detail: 'the new version would break a workspace where the extension is enabled', issues });
    const plan = capabilityPlan({ digest, manifest, builtin: version.source.startsWith('builtin:') }, enabled, request.grants);
    if (plan.kind === 'refused') return refused(plan.code, { detail: plan.detail, issues: plan.issues });
    if (plan.kind === 'required') {
      await this.#deps.commits.commitUnclaimed(this.#unit({ kind: 'extension.pending', name, digest }, context.correlationId));
      const workspaces = plan.params.workspaces.map((entry) => entry.workspaceId).join(', ');
      return refused('EXT_GRANTS_REQUIRED', { detail: `the new version needs grants in ${workspaces}`, hint: 'reload again with grants confirmed in the grant dialog', params: plan.params });
    }
    const migrate = stored !== undefined && stored < manifest.data.version;
    const config = migrate ? undefined : configProblem(connection, name, manifest, context.correlationId);
    if (config !== undefined) return { ok: false, problem: config, settled: false };
    registry.hold(name);
    try {
      await this.#deps.hosts.drainExtension(name, reloadGraceMs);
      this.#deps.faults.reach('reload.after-drain');
      if (migrate) {
        const outcome = await this.#deps.migrations.migrate({
          extension: name, target: { digest, manifest, snapshot }, active: current.manifestOf(name), isolation: mostIsolated(Object.values(plan.grants)),
          migrating: { digest, ...(request.grants === undefined ? {} : { grants: request.grants }) }, resume: false, correlationId: context.correlationId,
        });
        if (!outcome.ok) return { ok: false, problem: outcome.problem, settled: false };
      }
      this.#deps.faults.reach('reload.after-migrate-before-swap');
      return await this.#swap({ ...swap, grants: plan.grants, reloaded: [...enabled.keys()] }, context);
    } finally {
      registry.resume(name);
      this.#deps.scheduler.pump();
    }
  }

  // 04 §4.8: a reload redelivered after a crash (a later attempt) whose digest is already active, with no migration
  // recorded, finds the swap boot performed and succeeds without changes.
  #redeliveredAfterSwap(request: ReloadRequest, context: ReloadContext, active: boolean): context is ReloadContext & { claim: Claim } {
    return context.claim !== undefined && context.claim.attempt > 1 && active && request.grants === undefined && readMigrating(this.#deps.connection, request.name) === undefined;
  }

  // 03 §3.9 step 5, 04 §4.8: a migration `extensions.migrating` still records is resumed from the stored version with
  // its digest's code; an interrupted reload then swaps with the recorded grants, an interrupted enable only clears
  // `migrating` (its command is redelivered). Failures follow the part-way rule.
  async resume(name: string, correlationId: string): Promise<ReloadOutcome> {
    const { connection, registry } = this.#deps;
    const context = { correlationId };
    const migrating = readMigrating(connection, name);
    const version = migrating === undefined ? undefined : readInstalledVersion(connection, name, migrating.digest);
    if (migrating === undefined || version === undefined) return { ok: false, problem: this.#problem('NOT_FOUND', context, { detail: `${name} records no migration to resume` }), settled: false };
    const snapshot = await this.#deps.snapshots.verifyDigest(name, migrating.digest);
    if (snapshot === undefined) {
      await this.#deps.quarantine(name, 'EXT_INTEGRITY');
      return { ok: false, problem: this.#problem('EXT_INTEGRITY', context, { detail: `the snapshot ${migrating.digest} of ${name} does not match its digest` }), settled: false };
    }
    const { manifest } = version;
    const active = registry.current().manifestOf(name);
    const enabled = new Map([...registry.enabled()].flatMap(([workspaceId, names]) => {
      const granted = names.includes(name) ? registry.capabilities(name, workspaceId) : undefined;
      return granted === undefined ? [] : [[workspaceId, migrating.grants?.[workspaceId] ?? prunedGrant(manifest, granted)] as const];
    }));
    const outcome = await this.#deps.migrations.migrate({
      extension: name, target: { digest: migrating.digest, manifest, snapshot }, active, isolation: mostIsolated(enabled.values()), migrating, resume: true, correlationId,
    });
    if (!outcome.ok) return { ok: false, problem: outcome.problem, settled: false };
    if (migrating.digest === activeDigestOf(connection, name)) {
      const cleared = await this.#deps.pipeline.enqueue({ origin: { kind: 'change', change: { kind: 'migration.end', name }, correlationId }, writes: [], sends: [], publishes: [], replies: [] });
      return cleared.committed ? { ok: true, digest: migrating.digest } : { ok: false, problem: cleared.problem, settled: false };
    }
    const integrity = version.integrity === undefined ? {} : { integrity: version.integrity };
    return this.#swap({
      name, version: { digest: migrating.digest, source: version.source, ...integrity, namespace: manifest.meta.namespace, dataVersion: manifest.data.version },
      grants: Object.fromEntries(enabled), reloaded: [...enabled.keys()], cancelSchedules: changedSchedules(active, manifest),
    }, context);
  }

  // 06 §6.6 step 5: the swap unit, which also replies to a command's reload; the old code's hosts are then replaced.
  async #swap(swap: Swap, context: ReloadContext): Promise<ReloadOutcome> {
    const unit = this.#unit({ kind: 'extension.swap', ...swap }, context.correlationId, context.claim);
    const result = context.claim === undefined ? await this.#deps.pipeline.enqueue(unit) : await this.#deps.commits.commit(unit, context.claim);
    if (!result.committed) return { ok: false, problem: result.problem, settled: context.claim !== undefined };
    this.#deps.registry.refresh();
    this.#deps.hosts.replaceHosts(swap.name, reloadGraceMs);
    return { ok: true, digest: swap.version.digest };
  }

  #unit(change: VersionChange, correlationId: string, claim?: Claim): CommitUnit {
    return { origin: { kind: 'change', change, ...(claim === undefined ? {} : { command: claim.message }), correlationId }, writes: [], sends: [], publishes: [], replies: [] };
  }

  #problem(code: KernelErrorCode, context: ReloadContext, options: Omit<ProblemContext, 'correlationId'>): Problem {
    const messageId = context.claim?.message.id;
    return kernelProblem(code, { correlationId: context.correlationId, ...(messageId === undefined ? {} : { messageId }), ...options });
  }
}
