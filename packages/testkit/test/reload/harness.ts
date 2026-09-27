import { fileURLToPath } from 'node:url';
import { jsonObjectSchema, type Capabilities, type Isolation, type Json, type JsonObject, type ReplyPayload } from '@kvman/protocol';
import type { ExtensionDefinition } from '@kvman/sdk';
import { derivedCapabilities, readInstalledVersion, type Sender } from '@kvman/kernel';
import { installFixture } from '../install/fixture-snapshots.ts';
import { command, openInstallFixture, person, type InstallFixture } from '../install/harness.ts';
import { enable, grantsOf, query, rows, valueOf } from '../workspaces/harness.ts';
import steward from '../workspaces/fixtures/extensions/steward.ts';
import notes1Compat from './fixtures/extensions/notes/notes-1-compat.ts';
import notes1 from './fixtures/extensions/notes/notes-1.ts';
import notes2BadDoc from './fixtures/extensions/notes/notes-2-bad-doc.ts';
import notes2ConfigFix from './fixtures/extensions/notes/notes-2-config-fix.ts';
import notes2ConfigKeep from './fixtures/extensions/notes/notes-2-config-keep.ts';
import notes2Exit from './fixtures/extensions/notes/notes-2-exit.ts';
import notes2Fail from './fixtures/extensions/notes/notes-2-fail.ts';
import notes2Hang from './fixtures/extensions/notes/notes-2-hang.ts';
import notes2Narrow from './fixtures/extensions/notes/notes-2-narrow.ts';
import notes2Process from './fixtures/extensions/notes/notes-2-process.ts';
import notes2Strict from './fixtures/extensions/notes/notes-2-strict.ts';
import notes2 from './fixtures/extensions/notes/notes-2.ts';
import notes3 from './fixtures/extensions/notes/notes-3.ts';
import caller from './fixtures/extensions/others/caller.ts';
import lister from './fixtures/extensions/others/lister.ts';

// Reloads start hosts, migration hosts, and sandboxed processes for real.
export const reloadTests = { timeout: 120_000 } as const;

export const notesName = '@acme/notes';

const notesFolder = fileURLToPath(new URL('./fixtures/extensions/notes/', import.meta.url));
const othersFolder = fileURLToPath(new URL('./fixtures/extensions/others/', import.meta.url));
const workspaceFolder = fileURLToPath(new URL('../workspaces/fixtures/extensions/', import.meta.url));

// Each version of Notes, installed as its own snapshot (M2.7 test cases, "Notes").
export const notesVersions = {
  '1.0.0': { definition: notes1, entry: 'notes-1.ts' },
  '1.1.0': { definition: notes1Compat, entry: 'notes-1-compat.ts' },
  '2.0.0': { definition: notes2, entry: 'notes-2.ts' },
  '2.0.1': { definition: notes2Fail, entry: 'notes-2-fail.ts' },
  '3.0.0': { definition: notes3, entry: 'notes-3.ts' },
  '2.1.0': { definition: notes2Process, entry: 'notes-2-process.ts' },
  '2.2.0': { definition: notes2Strict, entry: 'notes-2-strict.ts' },
  '2.3.0': { definition: notes2ConfigFix, entry: 'notes-2-config-fix.ts' },
  '2.3.1': { definition: notes2ConfigKeep, entry: 'notes-2-config-keep.ts' },
  '2.4.0': { definition: notes2Hang, entry: 'notes-2-hang.ts' },
  '2.5.0': { definition: notes2Exit, entry: 'notes-2-exit.ts' },
  '2.6.0': { definition: notes2Narrow, entry: 'notes-2-narrow.ts' },
  '2.7.0': { definition: notes2BadDoc, entry: 'notes-2-bad-doc.ts' },
} as const satisfies Record<string, { definition: ExtensionDefinition; entry: string }>;

export type NotesVersionName = keyof typeof notesVersions;

export type ReloadFixture = InstallFixture & { digests: Map<NotesVersionName, string>; digestOf(version: NotesVersionName): string };

// A runtime with workspaces A and B, the versions of Notes given (the first is active), Lister, Caller, and Steward
// installed; nothing is enabled.
export async function openReloadFixture(versions: readonly NotesVersionName[], options: { home?: string } = {}): Promise<ReloadFixture> {
  const fixture = await openInstallFixture(options.home === undefined ? {} : { home: options.home });
  const digests = new Map<NotesVersionName, string>();
  for (const version of versions) {
    const { definition, entry } = notesVersions[version];
    digests.set(version, await installFixture(fixture.connection, fixture.home, { definition, folder: notesFolder, entry, version }));
  }
  for (const [definition, folder, entry] of [[lister, othersFolder, 'lister.ts'], [caller, othersFolder, 'caller.ts'], [steward, workspaceFolder, 'steward.ts']] as const) {
    await installFixture(fixture.connection, fixture.home, { definition, folder, entry });
  }
  fixture.runtime.registry.refresh();
  return {
    ...fixture, digests,
    digestOf: (version) => {
      const digest = digests.get(version);
      if (digest === undefined) throw new Error(`Notes ${version} is not installed in this fixture`);
      return digest;
    },
  };
}

// Exactly what an installed version of Notes requests and derives, at the isolation given (05 §5.7).
export function grantsForVersion(fixture: ReloadFixture, version: NotesVersionName, isolation: Isolation = 'sandboxed'): Capabilities {
  const installed = readInstalledVersion(fixture.connection, notesName, fixture.digestOf(version));
  if (installed === undefined) throw new Error(`Notes ${version} is not installed`);
  return { isolation, ...derivedCapabilities(installed.manifest) };
}

// Enables Notes with kernel.extension.enable, which writes its data version (04 §4.8).
export async function enableNotes(fixture: InstallFixture, workspaceId: string, isolation: Isolation = 'sandboxed'): Promise<ReplyPayload> {
  return enable(fixture, workspaceId, notesName, grantsOf(fixture, notesName, isolation));
}

export function reload(fixture: InstallFixture, payload: JsonObject, sender: Sender = person): Promise<ReplyPayload> {
  return command(fixture, 'kernel.extension.reload', { name: notesName, ...payload }, sender);
}

// kernel.config.set on Notes' config at its current revision (ADR 0125).
export async function setNotesConfig(fixture: InstallFixture, scope: 'global' | 'workspace', value: JsonObject, workspaceId?: string): Promise<void> {
  const [row] = scope === 'global'
    ? rows(fixture, 'SELECT revision FROM global_config WHERE extension = ?', notesName)
    : rows(fixture, 'SELECT revision FROM workspace_config WHERE extension = ? AND workspace_id = ?', notesName, workspaceId ?? '');
  const revision = Number(row?.['revision'] ?? 0);
  valueOf(await command(fixture, 'kernel.config.set', { extension: notesName, scope, value, revision, ...(workspaceId === undefined ? {} : { workspaceId }) }));
}

export async function addNote(fixture: InstallFixture, workspaceId: string, id: string, text: string, global = false): Promise<void> {
  valueOf(await command(fixture, 'notes.add', { id, text, global }, person, workspaceId));
}

// What `notes.version.get` answers in a workspace, or the code of its problem.
export async function versionIn(fixture: InstallFixture, workspaceId: string): Promise<string> {
  const answer = jsonObjectSchema.parse(JSON.parse(JSON.stringify(await query(fixture, 'notes.version.get', {}, person, workspaceId))));
  if (answer['ok'] !== true) return String(jsonObjectSchema.parse(answer['problem'])['code']);
  return String(jsonObjectSchema.parse(answer['value'])['version']);
}

export type NotesRow = { activeDigest: string; pendingDigest: string | null; migrating: Json; status: string; reason: string | null; stored: number | null };

export function notesRow(fixture: InstallFixture): NotesRow {
  const [row] = rows(fixture, 'SELECT active_digest, pending_digest, migrating, status, quarantine_reason FROM extensions WHERE name = ?', notesName);
  const [stored] = rows(fixture, 'SELECT version FROM schema_versions WHERE owner = ?', notesName);
  const migrating = row?.['migrating'];
  return {
    activeDigest: String(row?.['active_digest']), pendingDigest: typeof row?.['pending_digest'] === 'string' ? row['pending_digest'] : null,
    migrating: typeof migrating === 'string' ? jsonObjectSchema.parse(JSON.parse(migrating)) : null, status: String(row?.['status']),
    reason: typeof row?.['quarantine_reason'] === 'string' ? row['quarantine_reason'] : null, stored: stored === undefined ? null : Number(stored['version']),
  };
}

// Notes' documents of `items`, by workspace ('' for global) and id.
export function notesItems(fixture: InstallFixture): Array<{ ws: string; id: string; data: JsonObject }> {
  return rows(fixture, "SELECT ws, id, data FROM docs WHERE owner = ? AND collection = 'items' ORDER BY ws, id", notesName)
    .map((row) => ({ ws: String(row['ws']), id: String(row['id']), data: jsonObjectSchema.parse(JSON.parse(String(row['data']))) }));
}
