import { type ExtensionEnabled, type Json, type JsonObject, type Preset, type PresetChanged } from '@kvman/protocol';
import { kernelProblem } from '../problems.ts';
import { sameGrants } from '../registry/grant-validity.ts';
import { writeAppliedPreset } from './applied-presets.ts';
import { applyCatalogChange } from './catalog-changes.ts';
import { writeConfig } from './config-rows.ts';
import { applyExtensionChange, type ExtensionVersion } from './extension-changes.ts';
import { setMigrating } from './migration-changes.ts';
import { enabledAnywhere, readAppliedPreset } from './preset-changes.ts';
import { publishKernelEvent, UnitRejected, type UnitScope } from './unit-contents.ts';
import { releaseQuarantineOf } from './version-changes.ts';

// 07 §7.4, ADR 0148: the two units of kernel.preset.apply. `preset.install` commits steps 2 (import) and 3
// (installs) together, so a failure up to step 3 changes nothing; `preset.apply` commits step 7, the applied copy
// at the previous revision plus 1 with its config rows and events. kernel.preset.update (ADR 0149) reuses the
// `preset.apply` unit with cause 'update': it writes no config rows and re-checks the revision in the transaction.
export type PresetApplyChange =
  | { kind: 'preset.install'; catalog?: Preset; versions: ExtensionVersion[] }
  | { kind: 'preset.apply'; workspaceId: string; preset: Preset; dataVersions: Record<string, number>; cause: 'apply' | 'update'; config?: Record<string, JsonObject>; expectedRevision?: number };

function install(scope: UnitScope, change: Extract<PresetApplyChange, { kind: 'preset.install' }>): Json {
  if (change.catalog !== undefined) applyCatalogChange(scope, { kind: 'catalog.write', preset: change.catalog, builtin: false, cause: 'import' });
  for (const version of change.versions) applyExtensionChange(scope, { kind: 'install', version });
  return {};
}

function applyPreset(scope: UnitScope, change: Extract<PresetApplyChange, { kind: 'preset.apply' }>): Json {
  const { workspaceId } = change;
  const previous = readAppliedPreset(scope, workspaceId);
  if (change.cause === 'update') {
    if (previous === undefined) {
      throw new UnitRejected(kernelProblem('PRESET_REQUIRED', { correlationId: scope.correlationId, detail: `workspace ${workspaceId} has no applied preset`, hint: 'choose a preset for the workspace first' }));
    }
    if (previous.revision !== change.expectedRevision) {
      throw new UnitRejected(kernelProblem('PRESET_STALE', {
        correlationId: scope.correlationId,
        detail: `the applied preset is at revision ${previous.revision}, not ${change.expectedRevision}`,
        hint: 'read the current preset and try again',
        params: { revision: previous.revision },
      }));
    }
  }
  const revision = (previous?.revision ?? 0) + 1;
  writeAppliedPreset(scope.connection, workspaceId, { ...change.preset, revision }, scope.now);
  for (const name of Object.keys(change.dataVersions).sort()) {
    const version = change.dataVersions[name];
    if (version === undefined) continue;
    scope.connection.prepare('INSERT INTO schema_versions (owner, version) VALUES (?, ?) ON CONFLICT(owner) DO NOTHING').run(name, version);
    setMigrating(scope, name, undefined);
  }
  for (const extension of Object.keys(change.config ?? {}).sort()) {
    const value = change.config?.[extension];
    if (value === undefined) continue;
    writeConfig(scope, { extension, scope: 'workspace', workspaceId, value });
  }
  const before = previous?.preset.extensions ?? {};
  const after = change.preset.extensions;
  for (const name of Object.keys(after).sort()) {
    const next = after[name];
    const current = before[name];
    if (next?.enabled === true && !(current?.enabled === true && sameGrants(current.grants, next.grants))) {
      const enabled: ExtensionEnabled = { workspaceId, name };
      publishKernelEvent(scope, workspaceId, { type: 'kernel.extension.enabled', payload: enabled });
    }
  }
  const disabled: string[] = [];
  for (const name of Object.keys(before).sort()) {
    if (before[name]?.enabled === true && after[name]?.enabled !== true) {
      const payload: ExtensionEnabled = { workspaceId, name };
      publishKernelEvent(scope, workspaceId, { type: 'kernel.extension.disabled', payload });
      disabled.push(name);
    }
  }
  const changed: PresetChanged = { workspaceId, revision, cause: change.cause };
  publishKernelEvent(scope, workspaceId, { type: 'kernel.preset.changed', payload: changed });
  for (const name of disabled) {
    if (!enabledAnywhere(scope, name)) releaseQuarantineOf(scope, name);
  }
  return { revision };
}

export function applyPresetApplyChange(scope: UnitScope, change: PresetApplyChange): Json {
  return change.kind === 'preset.install' ? install(scope, change) : applyPreset(scope, change);
}
