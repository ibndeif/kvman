import {
  presetSchema, type Capabilities, type ExtensionEnabled, type ExtensionReloaded, type ExtensionUnquarantined, type Json, type Preset, type PresetChanged,
} from '@kvman/protocol';
import { sameGrants } from '../registry/grant-validity.ts';
import { cancelMessages } from './message-ending.ts';
import { publishKernelEvent, type UnitScope } from './unit-contents.ts';

// The version a reload makes active, as its preset entries name it (06 §6.6 step 5).
export type ActivatedVersion = { digest: string; source: string; integrity?: string; namespace: string; dataVersion: number };

// 06 §6.6–§6.7, 03 §3.6, ADRs 0144, 0145: the swap of a reload or rollback, the digest waiting for grants, and the
// release of a HOST_FAILURES quarantine.
export type VersionChange =
  | {
    kind: 'extension.swap';
    name: string;
    version: ActivatedVersion;
    // Each enabled workspace's grants after the reload, and the workspaces that announce it.
    grants: Record<string, Capabilities>;
    reloaded: readonly string[];
    // Schedules the new version removed or changed: their runs are cancelled (ADR 0144).
    cancelSchedules: readonly string[];
  }
  | { kind: 'extension.pending'; name: string; digest: string }
  | { kind: 'extension.unquarantine'; name: string };

export function releaseQuarantineOf(scope: UnitScope, name: string): void {
  const released = scope.connection.prepare("UPDATE extensions SET status = 'active', quarantine_reason = NULL WHERE name = ? AND status = 'quarantined'").run(name);
  if (released.changes === 0) return;
  const payload: ExtensionUnquarantined = { name };
  publishKernelEvent(scope, undefined, { type: 'kernel.extension.unquarantined', payload });
}

export function cancelSchedules(scope: UnitScope, name: string, schedules: readonly string[]): void {
  for (const schedule of schedules) {
    const rows = scope.connection.prepare('SELECT message_id FROM schedules WHERE extension = ? AND name = ?').all(name, schedule);
    cancelMessages(scope, rows.flatMap((row) => (typeof row['message_id'] === 'string' ? [row['message_id']] : [])));
    scope.connection.prepare('DELETE FROM schedules WHERE extension = ? AND name = ?').run(name, schedule);
  }
}

function announceGrants(scope: UnitScope, workspaceId: string, name: string, revision: number): void {
  const changed: PresetChanged = { workspaceId, revision, cause: 'enable' };
  publishKernelEvent(scope, workspaceId, { type: 'kernel.preset.changed', payload: changed });
  const enabled: ExtensionEnabled = { workspaceId, name };
  publishKernelEvent(scope, workspaceId, { type: 'kernel.extension.enabled', payload: enabled });
}

// Every applied preset listing the extension names the new version; where it is enabled and its grants change, the
// revision is bumped and announced. A preset whose grants stay keeps its revision.
function updatePresets(scope: UnitScope, change: Extract<VersionChange, { kind: 'extension.swap' }>): void {
  const { name, version } = change;
  for (const row of scope.connection.prepare('SELECT workspace_id, preset, revision FROM workspace_presets ORDER BY workspace_id').all()) {
    const preset: Preset = presetSchema.parse(JSON.parse(String(row['preset'])));
    const entry = preset.extensions[name];
    if (entry === undefined) continue;
    const workspaceId = String(row['workspace_id']);
    const granted = entry.enabled ? change.grants[workspaceId] : undefined;
    const grantsChanged = granted !== undefined && !sameGrants(entry.grants, granted);
    const { integrity: _integrity, ...rest } = entry;
    const updated = { ...rest, source: version.source, digest: version.digest, ...(version.integrity === undefined ? {} : { integrity: version.integrity }), grants: grantsChanged ? granted : entry.grants };
    const revision = Number(row['revision']) + (grantsChanged ? 1 : 0);
    scope.connection.prepare('UPDATE workspace_presets SET preset = ?, revision = ? WHERE workspace_id = ?')
      .run(JSON.stringify({ ...preset, revision, extensions: { ...preset.extensions, [name]: updated } }), revision, workspaceId);
    if (grantsChanged) announceGrants(scope, workspaceId, name, revision);
  }
}

// 06 §6.6 step 5: one unit swaps the digest, clears the recovery state, updates the presets, records the data version
// of an extension that had none, and announces the reload in each enabled workspace.
function swap(scope: UnitScope, change: Extract<VersionChange, { kind: 'extension.swap' }>): Json {
  const { name, version } = change;
  scope.connection.prepare('UPDATE extensions SET active_digest = ?, namespace = ?, pending_digest = NULL, migrating = NULL WHERE name = ?').run(version.digest, version.namespace, name);
  releaseQuarantineOf(scope, name);
  scope.connection.prepare('INSERT INTO schema_versions (owner, version) VALUES (?, ?) ON CONFLICT(owner) DO NOTHING').run(name, version.dataVersion);
  updatePresets(scope, change);
  cancelSchedules(scope, name, change.cancelSchedules);
  for (const workspaceId of change.reloaded) {
    const payload: ExtensionReloaded = { workspaceId, name, digest: version.digest };
    publishKernelEvent(scope, workspaceId, { type: 'kernel.extension.reloaded', payload });
  }
  return { digest: version.digest };
}

export function applyVersionChange(scope: UnitScope, change: VersionChange): Json {
  if (change.kind === 'extension.swap') return swap(scope, change);
  if (change.kind === 'extension.pending') {
    scope.connection.prepare('UPDATE extensions SET pending_digest = ? WHERE name = ?').run(change.digest, change.name);
    return {};
  }
  releaseQuarantineOf(scope, change.name);
  return {};
}
