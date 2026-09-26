import { join } from 'node:path';
import {
  betterSqlite3Driver, createUlidGenerator, insertWorkspace, openKernelDatabase, readAppliedPreset, writeAppliedPreset, type Connection, type OpenedFolder,
} from '@kvman/kernel';
import type { Capabilities, Preset } from '@kvman/protocol';

export const emptyGrant: Capabilities = { isolation: 'shared', requested: [], derived: { subscribes: [], providesLlm: [] } };

// The smallest applied preset, with no extension (ADR 0124).
export function emptyPreset(revision = 1): Preset {
  return { presetVersion: 1, id: 'test', name: 'Test', revision, app: { title: 'Test', home: '/' }, extensions: {} };
}

type PresetEntry = Preset['extensions'][string];

// An installed extension's active version as a preset entry names it.
function activeEntry(connection: Connection, name: string, grants: Capabilities): PresetEntry {
  const row = connection
    .prepare('SELECT v.source, v.integrity, v.digest FROM extensions e JOIN extension_versions v ON v.name = e.name AND v.digest = e.active_digest WHERE e.name = ?')
    .get(name);
  if (row === undefined) throw new Error(`${name} is not installed`);
  const integrity = row['integrity'];
  return { source: String(row['source']), ...(typeof integrity === 'string' ? { integrity } : {}), digest: String(row['digest']), enabled: true, grants };
}

// ADR 0124: a workspace with an applied preset that enables each named installed extension with its grant, written
// through the kernel's own storage functions; tests that need the real commands start from an empty one.
export function applyTestPreset(connection: Connection, folder: OpenedFolder, grants: Readonly<Record<string, Capabilities>> = {}, revision = 1): void {
  insertWorkspace(connection, folder, 1);
  const extensions = Object.fromEntries(Object.entries(grants).map(([name, granted]) => [name, activeEntry(connection, name, granted)]));
  writeAppliedPreset(connection, folder.workspaceId, { ...emptyPreset(revision), extensions }, 1);
}

// Enables (or re-grants) an installed extension in a workspace's applied preset, as the test helper writes it; the
// runtime's registry is refreshed by the caller.
export function enableInPreset(connection: Connection, workspaceId: string, name: string, grants: Capabilities): void {
  const applied = readAppliedPreset({ connection }, workspaceId);
  if (applied === undefined) throw new Error(`workspace ${workspaceId} has no applied preset`);
  const revision = applied.revision + 1;
  const extensions = { ...applied.preset.extensions, [name]: activeEntry(connection, name, grants) };
  writeAppliedPreset(connection, workspaceId, { ...applied.preset, revision, extensions }, 1);
}

// Writes to the database of a home no kernel runs on.
export function withHomeDatabase(home: string, write: (connection: Connection) => void): void {
  const connection = openKernelDatabase(join(home, 'kvman.db'), betterSqlite3Driver, createUlidGenerator(Date.now).next());
  try {
    write(connection);
  } finally {
    connection.close();
  }
}
