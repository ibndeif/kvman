import { describe, expect, it } from 'vitest';
import { commit, commitWrites, handlerStore, openStoreFixture, seedDocuments } from './harness.ts';

describe('versions (ADR 0031)', () => {
  it('M1.2-H3 a read-then-write loses to a concurrent write and succeeds on the rerun', async () => {
    const fixture = openStoreFixture();
    await seedDocuments(fixture, 'files', [{ id: 'f1', status: 'ready', createdAt: 1 }]);
    const first = handlerStore(fixture);
    const second = handlerStore(fixture);
    const firstFile = await first.store.collection('files').get('f1');
    const secondFile = await second.store.collection('files').get('f1');
    first.store.collection('files').put({ ...firstFile, status: 'translating' });
    second.store.collection('files').put({ ...secondFile, status: 'failed' });
    expect(await commit(fixture, first)).toMatchObject({ committed: true });
    expect(await commit(fixture, second)).toMatchObject({ committed: false, problem: { code: 'STORAGE_CONFLICT' } });
    const rerun = handlerStore(fixture);
    const current = await rerun.store.collection('files').get('f1');
    rerun.store.collection('files').put({ ...current, status: 'failed' });
    expect(await commit(fixture, rerun)).toMatchObject({ committed: true });
    expect(fixture.reader.documentGet('@acme/pdf', 'a'.repeat(64), 'files', 'f1')).toMatchObject({ version: 3, data: { status: 'failed' } });
  });

  it('M1.2-E12 writes carry the version they read, none when blind, 0 when read missing', async () => {
    const fixture = openStoreFixture();
    await commitWrites(fixture, [{ kind: 'kv.set', scope: 'workspace', key: 'read', value: 1 }]);
    const handler = handlerStore(fixture);
    await handler.store.kv.get('read');
    await handler.store.kv.get('missing');
    handler.store.kv.set('read', 2);
    handler.store.kv.set('blind', 1);
    handler.store.kv.set('missing', 1);
    expect(handler.writes()).toEqual([
      { kind: 'kv.set', scope: 'workspace', key: 'read', value: 2, expectedVersion: 1 },
      { kind: 'kv.set', scope: 'workspace', key: 'blind', value: 1 },
      { kind: 'kv.set', scope: 'workspace', key: 'missing', value: 1, expectedVersion: 0 },
    ]);
    await commitWrites(fixture, [{ kind: 'kv.set', scope: 'workspace', key: 'missing', value: 'someone else' }]);
    expect(await commit(fixture, handler)).toMatchObject({ committed: false, problem: { code: 'STORAGE_CONFLICT' } });
  });

  it('M1.2-E13 one write per key with the first-read version; find and list record versions', async () => {
    const fixture = openStoreFixture();
    await seedDocuments(fixture, 'files', [{ id: 'f1', status: 'ready', createdAt: 1 }]);
    await commitWrites(fixture, [{ kind: 'kv.set', scope: 'workspace', key: 'k:a', value: 1 }]);
    const handler = handlerStore(fixture);
    const [found] = await handler.store.collection('files').find({ where: { status: 'ready' } });
    await handler.store.kv.list('k:');
    handler.store.collection('files').put({ ...found, status: 'translating' });
    handler.store.collection('files').put({ ...found, status: 'translated' });
    handler.store.kv.set('k:a', 2);
    handler.store.kv.set('k:a', 3);
    expect(handler.writes()).toEqual([
      { kind: 'kv.set', scope: 'workspace', key: 'k:a', value: 3, expectedVersion: 1 },
      { kind: 'doc.put', scope: 'workspace', collection: 'files', id: 'f1', data: { id: 'f1', status: 'translated', createdAt: 1 }, expectedVersion: 1 },
    ]);
    expect(await commit(fixture, handler)).toMatchObject({ committed: true });
  });
});
