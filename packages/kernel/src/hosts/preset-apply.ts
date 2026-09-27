import {
  presetApplyRequestSchema, presetApplyStageRequestSchema,
  type Message, type Preset, type PresetApplyStageRequest, type Problem,
} from '@kvman/protocol';
import type { FaultPoints } from '../faults/fault-points.ts';
import { InstallFailure } from '../install/install-failure.ts';
import type { InstallService } from '../install/install-service.ts';
import type { SnapshotStore } from '../install/snapshot-store.ts';
import type { DataMigrations } from '../migrations/data-migrations.ts';
import { ProblemError } from '../problems.ts';
import type { RegistryState } from '../registry/registry-state.ts';
import type { Claim } from '../scheduler/dispatcher.ts';
import type { Scheduler } from '../scheduler/scheduler.ts';
import type { Connection } from '../storage/driver.ts';
import { readCatalogPreset } from '../storage/catalog-rows.ts';
import { readAppliedPreset } from '../storage/preset-changes.ts';
import { checkEnabledSet, checkedGrants } from '../presets/apply-checks.ts';
import { planApply } from '../presets/apply-plan.ts';
import { StagedApplies } from '../presets/staged-applies.ts';
import { resolveVersions, type ResolvedVersion } from '../presets/version-resolution.ts';
import { checkShareablePreset } from '../presets/preset-check.ts';
import { isAdministrator } from './administrators.ts';
import { parsed, refusal } from './command-payloads.ts';
import { KernelStopping } from './extension-commands.ts';
import type { ExtensionVersions } from './extension-versions.ts';
import type { KernelCommits } from './kernel-commits.ts';
import { appliedCopy, placeStagedTrees, prepareApplyData, presetConfigOf, switchVersions } from './preset-apply-steps.ts';
import type { SerialChanges } from './serial-changes.ts';
import { readWorkspace } from './workspace-rows.ts';

export type PresetApplyDeps = {
  connection: Connection;
  commits: KernelCommits;
  install: InstallService;
  staged: StagedApplies;
  registry: RegistryState;
  serial: SerialChanges;
  versions: ExtensionVersions;
  faults: FaultPoints;
  scheduler: Scheduler;
  snapshots: SnapshotStore;
  migrations: DataMigrations;
};

function problemOf(error: unknown, message: Message): Problem {
  if (error instanceof InstallFailure) return error.problem(message.correlationId, message.id);
  if (error instanceof ProblemError) return { ...error.problem, correlationId: message.correlationId, messageId: message.id };
  throw error;
}

// kernel.preset.apply.stage (07 §7.4, ADR 0148): an admin fetches what a preset needs, runs every check of apply,
// and answers the apply preview with a confirmation token. kernel.preset.apply (access user) then re-checks,
// installs, switches versions, migrates, and commits the applied preset.
export class PresetApply {
  readonly #deps: PresetApplyDeps;

  constructor(deps: PresetApplyDeps) {
    this.#deps = deps;
  }

  async stage(claim: Claim, signal: AbortSignal): Promise<void> {
    const { message } = claim;
    if (!isAdministrator(this.#deps.registry, message)) {
      return this.#deps.commits.fail(claim, refusal(message, 'CAPABILITY_DENIED', { detail: `${message.source} may not send ${message.type}`, hint: 'request kernel.admin' }));
    }
    const request = parsed(presetApplyStageRequestSchema, message);
    if (!request.ok) return this.#deps.commits.fail(claim, request.problem);
    const { workspaceId } = request.value;
    if (readWorkspace(this.#deps.connection, workspaceId) === undefined) {
      return this.#deps.commits.fail(claim, refusal(message, 'WORKSPACE_INVALID', { detail: `no workspace ${workspaceId} exists` }));
    }
    const resolved = this.#resolvePreset(message, request.value);
    if (!resolved.ok) return this.#deps.commits.fail(claim, resolved.problem);
    let versions: ResolvedVersion[];
    try {
      versions = await resolveVersions(resolved.preset, { install: this.#deps.install, connection: this.#deps.connection }, message.correlationId, signal);
    } catch (error) {
      if (error instanceof KernelStopping) throw error;
      return this.#deps.commits.fail(claim, problemOf(error, message));
    }
    const plan = planApply({
      workspaceId, preset: resolved.preset, versions, registry: this.#deps.registry, connection: this.#deps.connection,
      applied: readAppliedPreset({ connection: this.#deps.connection }, workspaceId),
      correlationId: message.correlationId, kvmanVersion: this.#deps.install.kvmanVersion, importing: resolved.importing,
    });
    if (!plan.ok) {
      for (const version of versions) {
        if (version.staged !== undefined) await this.#deps.install.discardStaged(version.staged);
      }
      return this.#deps.commits.fail(claim, plan.problem);
    }
    const { confirmationToken, expiresAt } = this.#deps.staged.add({ workspaceId, preset: resolved.preset, importing: resolved.importing, versions });
    const committed = await this.#deps.commits.reply(claim, { ...plan.plan.preview, confirmationToken, expiresAt });
    if (!committed.committed) await this.#deps.staged.discard(confirmationToken);
  }

  apply(claim: Claim): Promise<void> {
    return this.#deps.serial.run(() => this.#apply(claim));
  }

  // 07 §7.4 steps 1–7 (ADR 0148): the token, the checks against the current state, the staged trees, one unit for
  // the import and installs, the version switches, the checks against the resulting state, the data migrations,
  // and the unit that commits the applied preset.
  async #apply(claim: Claim): Promise<void> {
    const { message } = claim;
    const request = parsed(presetApplyRequestSchema, message);
    if (!request.ok) return this.#deps.commits.fail(claim, request.problem);
    const staged = await this.#deps.staged.take(request.value.confirmationToken);
    if (staged === undefined) {
      return this.#deps.commits.fail(claim, refusal(message, 'CONFIRMATION_EXPIRED', { detail: 'the apply preview expired or was already used', hint: 'stage the preset again' }));
    }
    const { workspaceId, preset, importing, versions } = staged;
    const planned = planApply({
      workspaceId, preset, versions, registry: this.#deps.registry, connection: this.#deps.connection,
      applied: readAppliedPreset({ connection: this.#deps.connection }, workspaceId),
      correlationId: message.correlationId, kvmanVersion: this.#deps.install.kvmanVersion, importing,
    });
    if (!planned.ok) {
      for (const version of versions) {
        if (version.staged !== undefined) await this.#deps.install.discardStaged(version.staged);
      }
      return this.#deps.commits.fail(claim, planned.problem);
    }
    this.#deps.faults.reach('preset.apply.after-stage');
    const placed = await placeStagedTrees(this.#deps, claim, versions);
    if (placed === undefined) return;
    if (importing || placed.length > 0) {
      const installed = await this.#deps.commits.commitUnclaimed({
        origin: { kind: 'change', change: { kind: 'preset.install', ...(importing ? { catalog: preset } : {}), versions: placed }, correlationId: message.correlationId },
        writes: [], sends: [], publishes: [], replies: [],
      });
      if (!installed.committed) return this.#deps.commits.fail(claim, installed.problem);
      this.#deps.registry.refresh();
    }
    if (!await switchVersions(this.#deps, claim, workspaceId, planned.plan.extensions, planned.plan.switches)) return;
    const regranted = checkedGrants(versions, message.correlationId);
    if (!regranted.ok) return this.#deps.commits.fail(claim, regranted.problem);
    const enabledProblem = checkEnabledSet(regranted.planned, {
      preset, registry: this.#deps.registry.current(), connection: this.#deps.connection, workspaceId, correlationId: message.correlationId,
    });
    if (enabledProblem !== undefined) return this.#deps.commits.fail(claim, enabledProblem);
    const dataVersions = await prepareApplyData(this.#deps, claim, workspaceId, regranted.planned);
    if (dataVersions === undefined) return;
    const config = presetConfigOf(message, preset);
    if (!config.ok) return this.#deps.commits.fail(claim, config.problem);
    const result = await this.#deps.commits.commit({
      origin: {
        kind: 'change',
        change: { kind: 'preset.apply', workspaceId, preset: appliedCopy(preset, regranted.planned), dataVersions, config: config.config, cause: 'apply' },
        command: message, correlationId: message.correlationId,
      },
      writes: [], sends: [], publishes: [], replies: [],
    }, claim);
    if (!result.committed) return;
    this.#deps.registry.refresh();
    this.#deps.scheduler.pump();
  }

  #resolvePreset(message: Message, request: PresetApplyStageRequest): { ok: true; preset: Preset; importing: boolean } | { ok: false; problem: Problem } {
    if ('presetId' in request) {
      const found = readCatalogPreset(this.#deps.connection, request.presetId);
      if (found === undefined) {
        return { ok: false, problem: refusal(message, 'NOT_FOUND', { detail: `no preset ${request.presetId} exists` }) };
      }
      return { ok: true, preset: found.preset, importing: false };
    }
    const checked = checkShareablePreset(request.json, this.#deps.registry.current().configSchemas());
    if (!checked.ok) {
      return { ok: false, problem: refusal(message, checked.code, { detail: checked.issues[0]?.message ?? checked.code, issues: checked.issues }) };
    }
    if (readCatalogPreset(this.#deps.connection, checked.preset.id)?.builtin === true) {
      return { ok: false, problem: refusal(message, 'PRESET_READONLY', { detail: `preset ${checked.preset.id} is built-in` }) };
    }
    return { ok: true, preset: checked.preset, importing: true };
  }
}
