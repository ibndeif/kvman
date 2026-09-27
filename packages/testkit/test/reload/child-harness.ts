import { jsonObjectSchema, manifestSchema, type Json } from '@kvman/protocol';
import { expect, vi } from 'vitest';
import { command } from '../adapters/http-client.ts';
import { inspect } from '../faults/ledger-database.ts';

export const notesName = '@acme/notes';

export type NotesState = { activeDigest: string; migrating: Json; stored: number | null; status: string; reason: string | null };

export function notesState(home: string): NotesState {
  return inspect(home, (connection) => {
    const row = connection.prepare('SELECT active_digest, migrating, status, quarantine_reason FROM extensions WHERE name = ?').get(notesName);
    const stored = connection.prepare('SELECT version FROM schema_versions WHERE owner = ?').get(notesName);
    const migrating = row?.['migrating'];
    return {
      activeDigest: String(row?.['active_digest']), migrating: typeof migrating === 'string' ? jsonObjectSchema.parse(JSON.parse(migrating)) : null,
      stored: stored === undefined ? null : Number(stored['version']), status: String(row?.['status']),
      reason: typeof row?.['quarantine_reason'] === 'string' ? row['quarantine_reason'] : null,
    };
  });
}

// The digest of an installed version of Notes.
export function notesDigest(home: string, version: string): string {
  return inspect(home, (connection) => {
    const found = connection.prepare('SELECT digest, manifest FROM extension_versions WHERE name = ?').all(notesName)
      .find((row) => manifestSchema.parse(JSON.parse(String(row['manifest']))).meta.version === version);
    if (found === undefined) throw new Error(`Notes ${version} is not installed`);
    return String(found['digest']);
  });
}

export function reloadedWorkspaces(home: string): string[] {
  return inspect(home, (connection) => connection.prepare("SELECT workspace_id FROM events WHERE type = 'kernel.extension.reloaded' ORDER BY seq").all().map((row) => String(row['workspace_id'])));
}

// How often a migration step wrote Notes' global config (step 2 sets `migrated`): its revision.
export function globalConfigRevision(home: string): number {
  return inspect(home, (connection) => Number(connection.prepare('SELECT revision FROM global_config WHERE extension = ?').get(notesName)?.['revision'] ?? 0));
}

// 14 §14.3 invariant 12: after a restart `extensions.migrating` is cleared, or kept by a MIGRATION_FAILED quarantine.
export function checkMigrationInvariant(home: string): void {
  const state = notesState(home);
  if (state.migrating !== null) expect(state).toMatchObject({ status: 'quarantined', reason: 'MIGRATION_FAILED' });
}

// A request to a kernel killed while it answers ends without a reply.
export async function unanswered(request: Promise<unknown>): Promise<void> {
  await request.then(() => undefined, () => undefined);
}

export async function until(check: () => void): Promise<void> {
  await vi.waitFor(check, { timeout: 60_000, interval: 50 });
}

export function reloadNotes(port: number, digest: string): Promise<unknown> {
  return command(port, 'kernel.extension.reload', { name: notesName, digest }, { wait: 60_000 });
}
