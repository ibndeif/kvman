import {
  jsonObjectSchema,
  type Capabilities, type JsonObject, type Message, type Preset, type Problem,
} from '@kvman/protocol';
import type { FaultPoints } from '../faults/fault-points.ts';
import { InstallFailure } from '../install/install-failure.ts';
import type { InstallService } from '../install/install-service.ts';
import type { SnapshotStore } from '../install/snapshot-store.ts';
import type { DataMigrations } from '../migrations/data-migrations.ts';
import type { RegistryState } from '../registry/registry-state.ts';
import type { Claim } from '../scheduler/dispatcher.ts';
import type { Connection } from '../storage/driver.ts';
import type { ExtensionVersion } from '../storage/extension-changes.ts';
import { readAppliedPreset } from '../storage/preset-changes.ts';
import type { PlannedExtension } from '../presets/apply-grants.ts';
import type { SwitchPlan } from '../presets/apply-checks.ts';
import type { ResolvedVersion } from '../presets/version-resolution.ts';
import { refusal } from './command-payloads.ts';
import { prepareEnableData } from './enable-data.ts';
import { KernelStopping } from './extension-commands.ts';
import type { ExtensionVersions } from './extension-versions.ts';
import type { KernelCommits } from './kernel-commits.ts';

export type PresetApplyStepDeps = {
  connection: Connection;
  commits: KernelCommits;
  install: InstallService;
  registry: RegistryState;
  versions: ExtensionVersions;
  faults: FaultPoints;
  snapshots: SnapshotStore;
  migrations: DataMigrations;
};

// 07 §7.4 step 1–3: every staged tree moved into snapshots; a changed tree discards the rest and fails the apply.
export async function placeStagedTrees(deps: PresetApplyStepDeps, claim: Claim, versions: readonly ResolvedVersion[]): Promise<ExtensionVersion[] | undefined> {
  const { message } = claim;
  const placed: ExtensionVersion[] = [];
  const pending = versions.filter((version) => version.staged !== undefined);
  for (let index = 0; index < pending.length; index += 1) {
    const version = pending[index];
    if (version?.staged === undefined) continue;
    try {
      placed.push(await deps.install.placeStaged(version.staged));
    } catch (error) {
      if (error instanceof KernelStopping) throw error;
      if (!(error instanceof InstallFailure)) throw error;
      for (const rest of pending.slice(index)) {
        if (rest.staged !== undefined) await deps.install.discardStaged(rest.staged);
      }
      await deps.commits.fail(claim, refusal(message, 'CONFIRMATION_EXPIRED', { detail: 'the staged content changed' }));
      return undefined;
    }
  }
  return placed;
}

// 07 §7.4 step 4 (06 §6.6): each version switch is a normal reload with the confirmed grants, in name order. A failed
// switch fails the apply; the earlier switches stay in place.
export async function switchVersions(
  deps: PresetApplyStepDeps,
  claim: Claim,
  workspaceId: string,
  extensions: readonly PlannedExtension[],
  switches: readonly SwitchPlan[],
): Promise<boolean> {
  const { message } = claim;
  const byName = new Map(extensions.map((extension) => [extension.name, extension] as const));
  for (const switched of [...switches].sort((left, right) => (left.name < right.name ? -1 : 1))) {
    const extension = byName.get(switched.name);
    if (extension === undefined) continue;
    const grants: Record<string, Capabilities> = { ...switched.grants };
    // reload takes grants only for workspaces that enable the extension now; the apply's own unit grants the target.
    if (deps.registry.enabled().get(workspaceId)?.includes(switched.name) === true) grants[workspaceId] = extension.grants;
    const outcome = await deps.versions.reload({ name: switched.name, digest: extension.version.digest, grants }, { correlationId: message.correlationId });
    if (!outcome.ok) {
      await deps.commits.fail(claim, outcome.problem);
      return false;
    }
    deps.faults.reach('preset.apply.after-version-switch');
  }
  return true;
}

// 07 §7.4 step 6 (04 §4.8): the extensions the new copy enables that the previous copy did not run their data
// migrations and config check, as enable does. An apply the kernel's shutdown interrupted stays running (ADR 0091).
export async function prepareApplyData(
  deps: PresetApplyStepDeps,
  claim: Claim,
  workspaceId: string,
  planned: readonly PlannedExtension[],
): Promise<Record<string, number> | undefined> {
  const { message } = claim;
  const previous = readAppliedPreset({ connection: deps.connection }, workspaceId)?.preset;
  const dataVersions: Record<string, number> = {};
  for (const extension of planned) {
    if (!extension.version.entry.enabled || previous?.extensions[extension.name]?.enabled === true) continue;
    const data = await prepareEnableData(deps, message, extension.name, extension.version.digest, extension.grants);
    if (!data.ok && data.problem.code === 'KERNEL_STOPPING') return undefined;
    if (!data.ok) {
      await deps.commits.fail(claim, data.problem);
      return undefined;
    }
    dataVersions[extension.name] = data.version;
  }
  return dataVersions;
}

// 07 §7.4 step 7, ADR 0148: the applied copy is the preset without its config, each entry with the digest of its
// local snapshot and the grant the plan confirmed (a builtin's is the bundled manifest's).
export function appliedCopy(preset: Preset, planned: readonly PlannedExtension[]): Preset {
  const digests = new Map(planned.map((extension) => [extension.name, extension.version.digest] as const));
  const grants = new Map(planned.map((extension) => [extension.name, extension.grants] as const));
  const applied: Preset = {
    ...preset,
    extensions: Object.fromEntries(Object.entries(preset.extensions).map(([name, entry]) => {
      const digest = digests.get(name);
      const granted = grants.get(name);
      return [name, digest === undefined || granted === undefined ? entry : { ...entry, digest, grants: granted }];
    })),
  };
  delete applied.config;
  return applied;
}

// The preset's config as workspace rows; a value no check caught as a non-object fails the apply.
export function presetConfigOf(message: Message, preset: Preset): { ok: true; config: Record<string, JsonObject> } | { ok: false; problem: Problem } {
  const config: Record<string, JsonObject> = {};
  for (const [extension, value] of Object.entries(preset.config ?? {})) {
    const parsedValue = jsonObjectSchema.safeParse(value);
    if (!parsedValue.success) {
      return {
        ok: false,
        problem: refusal(message, 'CONFIG_INVALID', {
          detail: `the config of ${extension} is not an object`,
          issues: [{ path: `config.${extension}`, message: 'a config value is an object of fields' }],
        }),
      };
    }
    config[extension] = parsedValue.data;
  }
  return { ok: true, config };
}
