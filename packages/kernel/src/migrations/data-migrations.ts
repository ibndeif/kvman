import { migratingRecordSchema, type Isolation, type Manifest, type MigratingRecord, type OutboundSend, type Problem, type QuarantineReason } from '@kvman/protocol';
import type { FaultPoints } from '../faults/fault-points.ts';
import type { VerifiedSnapshot } from '../hosts/snapshot-gate.ts';
import { storedConfigIssues } from '../config/stored-config.ts';
import { kernelProblem, ProblemError } from '../problems.ts';
import type { CommitPipeline } from '../storage/commit-pipeline.ts';
import type { Connection } from '../storage/driver.ts';
import { migrationNotice } from '../notifications/kernel-notices.ts';
import type { KernelChange } from '../storage/kernel-changes.ts';
import { MigrationHost, type MigrationHostOptions } from './migration-host.ts';

export type DataMigrationsDeps = {
  connection: Connection;
  pipeline: CommitPipeline;
  hosts: MigrationHostOptions;
  faults: FaultPoints;
  quarantine: (extension: string, reason: QuarantineReason) => Promise<void>;
};

// One migration: the target digest's code and the version active while it runs (for the part-way rule). `resume`
// continues one `extensions.migrating` already records (03 §3.9 step 5).
export type MigrationRequest = {
  extension: string;
  target: { digest: string; manifest: Manifest; snapshot: VerifiedSnapshot };
  active: Manifest | undefined;
  isolation: Isolation;
  migrating: MigratingRecord;
  resume: boolean;
  correlationId: string;
};

export type MigrationOutcome = { ok: true; ran: number } | { ok: false; problem: Problem; quarantined: boolean };

// ADR 0142: a code version covers a stored data version it equals or lists in compatibleWith.
export function covers(manifest: Manifest, stored: number): boolean {
  return manifest.data.version === stored || manifest.data.compatibleWith.includes(stored);
}

export function storedDataVersion(connection: Connection, extension: string): number | undefined {
  const row = connection.prepare('SELECT version FROM schema_versions WHERE owner = ?').get(extension);
  return row === undefined ? undefined : Number(row['version']);
}

export function readMigrating(connection: Connection, extension: string): MigratingRecord | undefined {
  const row = connection.prepare('SELECT migrating FROM extensions WHERE name = ?').get(extension);
  const text = row?.['migrating'];
  return typeof text === 'string' ? migratingRecordSchema.parse(JSON.parse(text)) : undefined;
}

// 04 §4.8: with no step to run, every stored config value is checked against the target schema at once.
export function configProblem(connection: Connection, extension: string, manifest: Manifest, correlationId: string): Problem | undefined {
  const issues = storedConfigIssues(connection, extension, manifest.config?.schema);
  const [first] = issues;
  if (first === undefined) return undefined;
  return kernelProblem('CONFIG_INVALID', { correlationId, detail: `${first.path}: ${first.message}`, issues, hint: 'fix the stored config, or add a migration step that fixes it' });
}

// 04 §4.8, ADR 0143: the steps from the stored version to the target's, each in its own unit, in a host of their own;
// a failure follows the part-way rule.
export class DataMigrations {
  readonly #deps: DataMigrationsDeps;
  readonly #hosts = new Set<MigrationHost>();

  constructor(deps: DataMigrationsDeps) {
    this.#deps = deps;
  }

  async migrate(request: MigrationRequest): Promise<MigrationOutcome> {
    const { extension, target, correlationId } = request;
    const stored = storedDataVersion(this.#deps.connection, extension) ?? target.manifest.data.version;
    if (!request.resume) await this.#change({ kind: 'migration.begin', name: extension, migrating: request.migrating }, correlationId);
    const host = new MigrationHost(this.#deps.hosts, { extension, manifest: target.manifest, snapshot: target.snapshot, isolation: request.isolation });
    this.#hosts.add(host);
    try {
      let committed = 0;
      for (let to = stored + 1; to <= target.manifest.data.version; to += 1) {
        if (committed > 0) this.#deps.faults.reach('migration.mid');
        const problem = await this.#step(host, request, to);
        if (problem?.code === 'KERNEL_STOPPING') return { ok: false, problem, quarantined: false };
        if (problem !== undefined) return await this.#failed(request, stored + committed, committed, problem);
        committed += 1;
      }
      return { ok: true, ran: committed };
    } finally {
      this.#hosts.delete(host);
      host.stop();
    }
  }

  // The migrations running now, with the isolation of their hosts.
  running(): Array<{ extension: string; isolation: Isolation }> {
    return [...this.#hosts].map((host) => ({ extension: host.extension, isolation: host.isolation }));
  }

  // At shutdown the hosts of migrations still running end; boot resumes those migrations (03 §3.9 step 5).
  stop(): void {
    for (const host of this.#hosts) host.stop();
  }

  // A step's problem, or undefined once its unit committed; a failing config check is the command's own problem.
  async #step(host: MigrationHost, request: MigrationRequest, to: number): Promise<Problem | undefined> {
    const { extension, target, correlationId } = request;
    const outcome = await host.step(to, correlationId);
    if (!outcome.ok) return outcome.problem.code === 'KERNEL_STOPPING' ? outcome.problem : this.#stepProblem(to, outcome.problem, correlationId);
    const { manifest } = target;
    const data = { collections: manifest.data.collections.map((collection) => collection.name), logs: manifest.data.logs.map((log) => log.prefix) };
    const last = to === manifest.data.version;
    const change: KernelChange = {
      kind: 'migration.step', name: extension, to, writes: outcome.writes, config: outcome.config, data, ...(last ? { check: { schema: manifest.config?.schema } } : {}),
    };
    const result = await this.#deps.pipeline.enqueue({ origin: { kind: 'change', change, correlationId }, writes: [], sends: [], publishes: [], replies: [] });
    if (result.committed) return undefined;
    return result.problem.code === 'CONFIG_INVALID' ? result.problem : this.#stepProblem(to, result.problem, correlationId);
  }

  #stepProblem(to: number, cause: Problem, correlationId: string): Problem {
    const detail = `step ${to} failed with ${cause.code}${cause.detail === undefined ? '' : `: ${cause.detail}`}`;
    return kernelProblem('MIGRATION_FAILED', { correlationId, detail, ...(cause.issues === undefined ? {} : { issues: cause.issues }) });
  }

  // 04 §4.8: with no committed step the data is unchanged; with some, the active version keeps running only if it
  // covers the version reached, else the extension is quarantined and `migrating` kept for Retry upgrade. A resumed
  // migration may have committed steps before the crash, which `migrating` does not record, so it is treated as one
  // that did.
  async #failed(request: MigrationRequest, reached: number, committed: number, problem: Problem): Promise<MigrationOutcome> {
    if ((committed > 0 || request.resume) && (request.active === undefined || !covers(request.active, reached))) {
      await this.#deps.quarantine(request.extension, 'MIGRATION_FAILED');
      return { ok: false, problem, quarantined: true };
    }
    await this.#change({ kind: 'migration.end', name: request.extension }, request.correlationId, [migrationNotice(request.extension, problem)]);
    return { ok: false, problem, quarantined: false };
  }

  // ADR 0164: a failure that keeps the old version notifies the person with the migration's end.
  async #change(change: KernelChange, correlationId: string, sends: OutboundSend[] = []): Promise<void> {
    const result = await this.#deps.pipeline.enqueue({ origin: { kind: 'change', change, correlationId }, writes: [], sends, publishes: [], replies: [] });
    if (!result.committed) throw new ProblemError(result.problem);
  }
}
