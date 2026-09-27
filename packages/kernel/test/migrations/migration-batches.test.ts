import { manifestSchema, type Json, type Manifest, type MigrationCursor, type MigrationData } from '@kvman/protocol';
import { describe, expect, it } from 'vitest';
import { betterSqlite3Driver, openKernelDatabase, readMigrationRows, type Connection, type RowsRequest } from '../../src/index.ts';
import { manifest as baseManifest, workspaceA, workspaceB } from '../registry/manifests.ts';
import { temporaryDatabaseFile, ulids } from '../storage/harness.ts';

const notes: Manifest = manifestSchema.parse({
  ...baseManifest('@acme/notes', 'notes', {}),
  data: {
    version: 1, compatibleWith: [], migrations: [],
    collections: [{ name: 'items', description: 'Items.', schema: { type: 'object' }, idField: 'id' }],
    logs: [{ prefix: 'history:*', description: 'History.', entry: {} }, { prefix: 'audit', description: 'Audit.', entry: {} }],
  },
});

function seed(connection: Connection): void {
  for (const owner of ['@acme/notes', '@acme/other']) {
    for (const ws of [workspaceB, '', workspaceA]) {
      for (const key of ['k2', 'k1', 'k3']) connection.prepare('INSERT INTO kv (owner, ws, key, value, version, updated_at) VALUES (?, ?, ?, ?, 1, 0)').run(owner, ws, key, JSON.stringify(`${ws}:${key}`));
      for (const id of ['b', 'a', 'c']) connection.prepare('INSERT INTO docs (owner, ws, collection, id, data, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, 0, 0)').run(owner, ws, 'items', id, JSON.stringify({ id }));
      for (const log of ['history:y', 'history:x', 'audit']) {
        for (const seq of [2, 1]) connection.prepare('INSERT INTO logs (owner, ws, log, seq, data, at) VALUES (?, ?, ?, ?, ?, 0)').run(owner, ws, log, seq, JSON.stringify(seq));
      }
    }
  }
}

// Every row of one request, following the cursors batch after batch.
function allRows(connection: Connection, request: { data: MigrationData; collection?: string; log?: string }): Json[] {
  const found: Json[] = [];
  let after: MigrationCursor | undefined;
  do {
    const answer = readMigrationRows(connection, notes, { ...request, ...(after === undefined ? {} : { after }) }, 'corr', 2);
    if (!answer.ok) throw new Error(answer.problem.code);
    found.push(...answer.rows.rows);
    after = answer.rows.next;
  } while (after !== undefined);
  return found;
}

describe('migration batches (plan 04 §4.8, ADR 0143)', () => {
  it("M2.7-E38 migrations never touch other extensions' data or blobs", () => {
    const connection = openKernelDatabase(temporaryDatabaseFile(), betterSqlite3Driver, ulids.next());
    seed(connection);
    const scopes = [null, workspaceA, workspaceB];
    expect(allRows(connection, { data: 'kv' })).toEqual(scopes.flatMap((workspaceId) => ['k1', 'k2', 'k3'].map((key) => ({ workspaceId, key, value: `${workspaceId ?? ''}:${key}` }))));
    expect(allRows(connection, { data: 'docs', collection: 'items' })).toEqual(scopes.flatMap((workspaceId) => ['a', 'b', 'c'].map((id) => ({ workspaceId, id, doc: { id } }))));
    expect(allRows(connection, { data: 'logs', log: 'history:*' })).toEqual(scopes.flatMap((workspaceId) => ['history:x', 'history:y'].flatMap((log) => [1, 2].map((seq) => ({ workspaceId, log, seq, value: seq })))));
    expect(allRows(connection, { data: 'logs', log: 'audit' })).toEqual(scopes.flatMap((workspaceId) => [1, 2].map((seq) => ({ workspaceId, log: 'audit', seq, value: seq }))));
    const unregistered: RowsRequest[] = [{ data: 'docs', collection: 'other' }, { data: 'logs', log: 'missing' }, { data: 'logs', log: 'history:x' }];
    for (const request of unregistered) {
      const answer = readMigrationRows(connection, notes, request, 'corr', 2);
      expect(answer.ok ? 'ok' : answer.problem.code, JSON.stringify(request)).toBe('VALIDATION_FAILED');
    }
    connection.close();
  });
});
