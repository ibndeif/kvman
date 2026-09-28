import { presetSchema, type ExtensionInstalled, type ExtensionUninstalled, type Json, type Manifest, type PresetChanged } from '@kvman/protocol';
import type { Connection } from './driver.ts';
import { cancelMessages } from './message-ending.ts';
import { admitPublish, type UnitScope } from './unit-contents.ts';

// One installed version of an extension, as `extension_versions` keeps it (06 §6.7).
export type ExtensionVersion = { name: string; digest: string; source: string; integrity?: string; manifest: Manifest; installedAt: number };

// The kernel's writes to the extension catalog, applied in a unit so their rows, events, and reply commit together.
export type ExtensionChange =
  | { kind: 'install'; version: ExtensionVersion }
  | { kind: 'uninstall'; name: string; deleteData: boolean };

// 06 §6.2 step 8, ADR 0118: a new version gets its row, and the first version of a name becomes active. A digest
// already installed writes nothing; the result says whether rows were written.
export function insertVersionRows(connection: Connection, version: ExtensionVersion): boolean {
  const { name, digest, manifest } = version;
  if (connection.prepare('SELECT 1 AS found FROM extension_versions WHERE name = ? AND digest = ?').get(name, digest) !== undefined) return false;
  connection
    .prepare('INSERT INTO extension_versions (name, digest, source, integrity, manifest, data_schema, installed_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(name, digest, version.source, version.integrity ?? null, JSON.stringify(manifest), manifest.data.version, version.installedAt);
  connection
    .prepare(`INSERT INTO extensions (name, namespace, active_digest, status, installed_at) VALUES (?, ?, ?, 'active', ?)
      ON CONFLICT(name) DO UPDATE SET namespace = COALESCE(extensions.namespace, excluded.namespace),
        active_digest = COALESCE(extensions.active_digest, excluded.active_digest), installed_at = COALESCE(extensions.installed_at, excluded.installed_at)`)
    .run(name, manifest.meta.namespace, digest, version.installedAt);
  return true;
}

// An installed digest is announced once; installing it again replies the same and announces nothing.
function install(scope: UnitScope, version: ExtensionVersion): Json {
  const { name, digest } = version;
  if (!insertVersionRows(scope.connection, version)) return { name, digest };
  const payload: ExtensionInstalled = { name, digest };
  admitPublish(scope, { type: 'kernel.extension.installed', payload });
  return { name, digest };
}

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (character) => `\\${character}`);
}

// A command's handler column is its extension; an event delivery's is `<extension>|subscription:<pattern>`.
function unfinishedMessages(scope: UnitScope, name: string): string[] {
  return scope.connection
    .prepare(`SELECT id FROM messages WHERE state IN ('pending', 'running', 'awaiting') AND (handler = ? OR handler LIKE ? ESCAPE '\\') ORDER BY seq`)
    .all(name, `${escapeLike(name)}|%`)
    .map((row) => String(row['id']));
}

const dataTables = [
  ['kv', 'owner'], ['docs', 'owner'], ['logs', 'owner'], ['blob_refs', 'owner'], ['global_config', 'extension'], ['workspace_config', 'extension'],
  ['schema_versions', 'owner'],
] as const;

// 06 §6.8: its entry in every applied preset goes, with a revision and kernel.preset.changed per changed workspace.
function removePresetEntries(scope: UnitScope, name: string): void {
  const rows = scope.connection.prepare('SELECT workspace_id, preset, revision FROM workspace_presets ORDER BY workspace_id').all();
  for (const row of rows) {
    const preset = presetSchema.parse(JSON.parse(String(row['preset'])));
    if (preset.extensions[name] === undefined) continue;
    const revision = Number(row['revision']) + 1;
    const extensions = Object.fromEntries(Object.entries(preset.extensions).filter(([extension]) => extension !== name));
    const workspaceId = String(row['workspace_id']);
    scope.connection.prepare('UPDATE workspace_presets SET preset = ?, revision = ? WHERE workspace_id = ?')
      .run(JSON.stringify({ ...preset, revision, extensions }), revision, workspaceId);
    const payload: PresetChanged = { workspaceId, revision, cause: 'disable' };
    admitPublish({ ...scope, workspaceId }, { type: 'kernel.preset.changed', payload });
  }
}

function deleteData(scope: UnitScope, name: string): void {
  for (const [table, column] of dataTables) scope.connection.prepare(`DELETE FROM ${table} WHERE ${column} = ?`).run(name);
  scope.connection.prepare('DELETE FROM notifications WHERE source = ?').run(`ext:${name}`);
  removePresetEntries(scope, name);
}

// 06 §6.8, ADRs 0120, 0144, 0152: its unfinished messages are cancelled without onAbort (the owner is gone), its rows,
// schedules, and model rows go, and with deleteData every row it owns and, after the commit, its secrets.
function uninstall(scope: UnitScope, name: string, withData: boolean): Json {
  cancelMessages(scope, unfinishedMessages(scope, name), { sendAbort: false });
  scope.connection.prepare('DELETE FROM extension_versions WHERE name = ?').run(name);
  scope.connection.prepare('DELETE FROM extensions WHERE name = ?').run(name);
  scope.connection.prepare('DELETE FROM schedules WHERE extension = ?').run(name);
  scope.connection.prepare('DELETE FROM llm_models WHERE extension = ?').run(name);
  if (withData) {
    deleteData(scope, name);
    scope.applied.secrets.push({ kind: 'clear-extension', extension: name });
  }
  const payload: ExtensionUninstalled = { name };
  admitPublish(scope, { type: 'kernel.extension.uninstalled', payload });
  return {};
}

export function applyExtensionChange(scope: UnitScope, change: ExtensionChange): Json {
  return change.kind === 'install' ? install(scope, change.version) : uninstall(scope, change.name, change.deleteData);
}

