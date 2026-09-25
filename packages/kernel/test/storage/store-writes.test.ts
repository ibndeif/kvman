import type { Message, StoreWrite } from '@kvman/protocol';
import { describe, expect, it } from 'vitest';
import type { CommitResult } from '../../src/index.ts';
import { invocationMessage, openTestStore, rows, type TestStore } from './harness.ts';

const extension = '@acme/pdf';

async function commitWrites(store: TestStore, writes: StoreWrite[], invocation?: Message): Promise<CommitResult> {
  const message = invocation ?? (await invocationMessage(store));
  return store.pipeline.enqueue({
    origin: { kind: 'invocation', invocation: { message, extension, outcome: { ok: true, value: null }, stored: true } },
    writes,
    sends: [],
    publishes: [],
    replies: [],
  });
}

function versionOf(store: TestStore, table: 'kv' | 'docs', key: string): number | undefined {
  const column = table === 'kv' ? 'key' : 'id';
  const [row] = rows(store.connection, `SELECT version FROM ${table} WHERE ${column} = ?`, key);
  return row === undefined ? undefined : Number(row['version']);
}

const conflict = { committed: false, problem: { code: 'STORAGE_CONFLICT' } };

describe('writes and versions (ADR 0031)', () => {
  it('M1.1-E6 blind writes insert at 1 and then overwrite with version + 1', async () => {
    const store = openTestStore({ 'pdf.translate': extension });
    await commitWrites(store, [{ kind: 'kv.set', scope: 'workspace', key: 'k', value: 1 }, { kind: 'doc.put', scope: 'workspace', collection: 'files', id: 'f1', data: { n: 1 } }]);
    await commitWrites(store, [{ kind: 'kv.set', scope: 'workspace', key: 'k', value: 2 }, { kind: 'doc.put', scope: 'workspace', collection: 'files', id: 'f1', data: { n: 2 } }]);
    expect(versionOf(store, 'kv', 'k')).toBe(2);
    expect(rows(store.connection, 'SELECT data, version FROM docs')).toEqual([{ data: '{"n":2}', version: 2 }]);
  });

  it('M1.1-E7 expectedVersion 0 inserts a missing key and conflicts on an existing one', async () => {
    const store = openTestStore({ 'pdf.translate': extension });
    expect(await commitWrites(store, [{ kind: 'kv.set', scope: 'workspace', key: 'k', value: 1, expectedVersion: 0 }])).toMatchObject({ committed: true });
    expect(versionOf(store, 'kv', 'k')).toBe(1);
    expect(await commitWrites(store, [{ kind: 'kv.set', scope: 'workspace', key: 'k', value: 2, expectedVersion: 0 }])).toMatchObject(conflict);
    expect(await commitWrites(store, [{ kind: 'doc.put', scope: 'workspace', collection: 'files', id: 'f1', data: {}, expectedVersion: 0 }])).toMatchObject({ committed: true });
    expect(await commitWrites(store, [{ kind: 'doc.put', scope: 'workspace', collection: 'files', id: 'f1', data: {}, expectedVersion: 0 }])).toMatchObject(conflict);
  });

  it('M1.1-E8 expectedVersion n writes only at version n', async () => {
    const store = openTestStore({ 'pdf.translate': extension });
    await commitWrites(store, [{ kind: 'doc.put', scope: 'workspace', collection: 'files', id: 'f1', data: { n: 1 } }]);
    expect(await commitWrites(store, [{ kind: 'doc.put', scope: 'workspace', collection: 'files', id: 'f1', data: { n: 2 }, expectedVersion: 1 }])).toMatchObject({ committed: true });
    expect(versionOf(store, 'docs', 'f1')).toBe(2);
    expect(await commitWrites(store, [{ kind: 'doc.put', scope: 'workspace', collection: 'files', id: 'f1', data: { n: 3 }, expectedVersion: 1 }])).toMatchObject(conflict);
    expect(await commitWrites(store, [{ kind: 'kv.set', scope: 'workspace', key: 'missing', value: 1, expectedVersion: 3 }])).toMatchObject(conflict);
  });

  it('M1.1-E9 deletes follow the same version rules', async () => {
    const store = openTestStore({ 'pdf.translate': extension });
    const put = (key: string): StoreWrite => ({ kind: 'kv.set', scope: 'workspace', key, value: 1 });
    await commitWrites(store, [put('a'), put('b'), put('c'), put('d')]);
    expect(await commitWrites(store, [{ kind: 'kv.delete', scope: 'workspace', key: 'a' }])).toMatchObject({ committed: true });
    expect(await commitWrites(store, [{ kind: 'kv.delete', scope: 'workspace', key: 'b', expectedVersion: 1 }])).toMatchObject({ committed: true });
    expect(await commitWrites(store, [{ kind: 'kv.delete', scope: 'workspace', key: 'c', expectedVersion: 7 }])).toMatchObject(conflict);
    expect(await commitWrites(store, [{ kind: 'kv.delete', scope: 'workspace', key: 'd', expectedVersion: 0 }])).toMatchObject(conflict);
    expect(rows(store.connection, 'SELECT key FROM kv ORDER BY key')).toEqual([{ key: 'c' }, { key: 'd' }]);
  });

  it('M1.1-E10 log appends take free seqs; truncate and drop remove entries', async () => {
    const store = openTestStore({ 'pdf.translate': extension });
    const append = (seq: number): StoreWrite => ({ kind: 'log.append', scope: 'workspace', log: 'history:s1', seq, value: { seq } });
    expect(await commitWrites(store, [append(1), append(2), append(3)])).toMatchObject({ committed: true });
    expect(await commitWrites(store, [append(3)])).toMatchObject(conflict);
    await commitWrites(store, [{ kind: 'log.truncate-before', scope: 'workspace', log: 'history:s1', seq: 3 }]);
    expect(rows(store.connection, 'SELECT seq FROM logs')).toEqual([{ seq: 3 }]);
    await commitWrites(store, [{ kind: 'log.drop', scope: 'workspace', log: 'history:s1' }]);
    expect(rows(store.connection, 'SELECT seq FROM logs')).toEqual([]);
  });

  it('M1.1-E11 global and workspace writes are stored apart, owned by the invocation\'s extension', async () => {
    const store = openTestStore({ 'pdf.translate': extension });
    const invocation = await invocationMessage(store);
    await commitWrites(store, [{ kind: 'kv.set', scope: 'global', key: 'k', value: 'g' }, { kind: 'kv.set', scope: 'workspace', key: 'k', value: 'w' }], invocation);
    expect(rows(store.connection, 'SELECT owner, ws, value FROM kv ORDER BY ws')).toEqual([
      { owner: extension, ws: '', value: '"g"' },
      { owner: extension, ws: invocation.workspaceId ?? '', value: '"w"' },
    ]);
  });
});
