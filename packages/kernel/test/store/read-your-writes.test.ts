import { describe, expect, it } from 'vitest';
import { commitWrites, handlerStore, openStoreFixture, seedDocuments } from './harness.ts';

describe('read-your-writes (plan 04 §4.3)', () => {
  it('M1.2-H2 reads see the unit\'s own pending writes', async () => {
    const fixture = openStoreFixture();
    await seedDocuments(fixture, 'files', [
      { id: 'a', status: 'ready', createdAt: 1 }, { id: 'b', status: 'ready', createdAt: 2 }, { id: 'c', status: 'ready', createdAt: 3 },
    ]);
    await commitWrites(fixture, [
      { kind: 'kv.set', scope: 'workspace', key: 'k:1', value: 1 }, { kind: 'kv.set', scope: 'workspace', key: 'k:2', value: 2 },
      { kind: 'log.append', scope: 'workspace', log: 'history:s1', seq: 1, value: 'one' },
    ]);
    const { store } = handlerStore(fixture);
    const files = store.collection('files');
    files.put({ id: 'd', status: 'ready', createdAt: 4 });
    files.delete('b');
    await files.patch('a', { status: 'translated' });
    expect(await files.get('b')).toBeUndefined();
    expect(await files.get('d')).toEqual({ id: 'd', status: 'ready', createdAt: 4 });
    expect(await files.find({ where: { status: 'ready' }, orderBy: [['createdAt', 'desc']], limit: 2 })).toEqual([
      { id: 'd', status: 'ready', createdAt: 4 }, { id: 'c', status: 'ready', createdAt: 3 },
    ]);
    expect(await files.count({ where: { status: 'ready' } })).toBe(2);
    expect(await files.count()).toBe(3);
    store.kv.set('k:3', 3);
    store.kv.delete('k:1');
    expect(await store.kv.get('k:1')).toBeUndefined();
    expect(await store.kv.list('k:')).toEqual([{ key: 'k:2', value: 2 }, { key: 'k:3', value: 3 }]);
    const history = store.log('history:s1');
    await history.append('two');
    expect(await history.read()).toEqual([{ seq: 1, value: 'one' }, { seq: 2, value: 'two' }]);
    expect(await history.last()).toEqual({ seq: 2, value: 'two' });
  });
});
