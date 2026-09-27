import { presetSchema, type ExtensionEnabled, type Json, type Preset, type PresetChanged } from '@kvman/protocol';
import { kernelProblem } from '../problems.ts';
import { sameGrants } from '../registry/grant-validity.ts';
import { setMigrating } from './migration-changes.ts';
import { publishKernelEvent, UnitRejected, type UnitScope } from './unit-contents.ts';
import { releaseQuarantineOf } from './version-changes.ts';

export type PresetEntry = Preset['extensions'][string];

// Enable and disable edit the applied preset (06 §6.4, ADR 0123); the checks ran before the unit. The unit that
// completes an enable records the data version of an extension that had none and clears `migrating` (04 §4.8).
export type PresetChange =
  | { kind: 'extension.enable'; workspaceId: string; name: string; entry: PresetEntry; dataVersion: number }
  | { kind: 'extension.disable'; workspaceId: string; name: string };

type AppliedPreset = { preset: Preset; revision: number };

export function readAppliedPreset(scope: Pick<UnitScope, 'connection'>, workspaceId: string): AppliedPreset | undefined {
  const row = scope.connection.prepare('SELECT preset, revision FROM workspace_presets WHERE workspace_id = ?').get(workspaceId);
  return row === undefined ? undefined : { preset: presetSchema.parse(JSON.parse(String(row['preset']))), revision: Number(row['revision']) };
}

function presetOf(scope: UnitScope, workspaceId: string): AppliedPreset {
  const applied = readAppliedPreset(scope, workspaceId);
  if (applied !== undefined) return applied;
  throw new UnitRejected(kernelProblem('PRESET_REQUIRED', { correlationId: scope.correlationId, detail: `workspace ${workspaceId} has no applied preset`, hint: 'choose a preset for the workspace first' }));
}

// Every write bumps the revision and is announced in the workspace (03 §3.8).
function writePreset(scope: UnitScope, workspaceId: string, applied: AppliedPreset, extensions: Preset['extensions'], change: { name: string; cause: 'enable' | 'disable' }): Json {
  const revision = applied.revision + 1;
  scope.connection.prepare('UPDATE workspace_presets SET preset = ?, revision = ? WHERE workspace_id = ?')
    .run(JSON.stringify({ ...applied.preset, revision, extensions }), revision, workspaceId);
  const changed: PresetChanged = { workspaceId, revision, cause: change.cause };
  publishKernelEvent(scope, workspaceId, { type: 'kernel.preset.changed', payload: changed });
  const extension: ExtensionEnabled = { workspaceId, name: change.name };
  publishKernelEvent(scope, workspaceId, { type: change.cause === 'enable' ? 'kernel.extension.enabled' : 'kernel.extension.disabled', payload: extension });
  return { revision };
}

function enable(scope: UnitScope, change: Extract<PresetChange, { kind: 'extension.enable' }>): Json {
  const applied = presetOf(scope, change.workspaceId);
  scope.connection.prepare('INSERT INTO schema_versions (owner, version) VALUES (?, ?) ON CONFLICT(owner) DO NOTHING').run(change.name, change.dataVersion);
  setMigrating(scope, change.name, undefined);
  const current = applied.preset.extensions[change.name];
  if (current?.enabled === true && sameGrants(current.grants, change.entry.grants)) return { revision: applied.revision };
  const entry = current?.disable === undefined ? change.entry : { ...change.entry, disable: current.disable };
  return writePreset(scope, change.workspaceId, applied, { ...applied.preset.extensions, [change.name]: entry }, { name: change.name, cause: 'enable' });
}

function enabledAnywhere(scope: UnitScope, name: string): boolean {
  return scope.connection
    .prepare('SELECT preset FROM workspace_presets')
    .all()
    .some((row) => presetSchema.parse(JSON.parse(String(row['preset']))).extensions[name]?.enabled === true);
}

// 03 §3.6: disabled in every workspace, a quarantined extension is released (ADR 0123).
function releaseQuarantine(scope: UnitScope, name: string): void {
  if (!enabledAnywhere(scope, name)) releaseQuarantineOf(scope, name);
}

function disable(scope: UnitScope, change: Extract<PresetChange, { kind: 'extension.disable' }>): Json {
  const applied = presetOf(scope, change.workspaceId);
  const current = applied.preset.extensions[change.name];
  const reply = current?.enabled === true
    ? writePreset(scope, change.workspaceId, applied, { ...applied.preset.extensions, [change.name]: { ...current, enabled: false } }, { name: change.name, cause: 'disable' })
    : { revision: applied.revision };
  releaseQuarantine(scope, change.name);
  return reply;
}

export function applyPresetChange(scope: UnitScope, change: PresetChange): Json {
  return change.kind === 'extension.enable' ? enable(scope, change) : disable(scope, change);
}
