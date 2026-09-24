import { describe, expect, it } from 'vitest';
import { commit, handlerStore, openStoreFixture, seedDocuments } from './harness.ts';

describe('store API (plan 04 §4.3)', () => {
  it('M1.2-H1 every method has the return type of 04 §4.3', async () => {
    const fixture = openStoreFixture();
    await seedDocuments(fixture, 'files', [{ id: 'f1', status: 'ready', createdAt: 1 }, { id: 'f2', status: 'failed', createdAt: 2 }]);
    const { store } = handlerStore(fixture);
    expect(await store.kv.get('missing')).toBeUndefined();
    expect(store.kv.set('turn:s1', { status: 'running' })).toBeUndefined();
    expect(await store.kv.get('turn:s1')).toEqual({ status: 'running' });
    expect(await store.kv.list('turn:')).toEqual([{ key: 'turn:s1', value: { status: 'running' } }]);
    expect(store.kv.delete('turn:s1')).toBeUndefined();
    const files = store.collection('files');
    expect(await files.get('f1')).toEqual({ id: 'f1', status: 'ready', createdAt: 1 });
    expect(await files.get('nope')).toBeUndefined();
    expect(files.put({ id: 'f3', status: 'ready', createdAt: 3 })).toBeUndefined();
    expect(await files.patch('f1', { status: 'translated' })).toEqual({ id: 'f1', status: 'translated', createdAt: 1 });
    expect(files.delete('f2')).toBeUndefined();
    expect(await files.find({ where: { status: { in: ['ready', 'translated'] } }, orderBy: [['createdAt', 'desc']], limit: 5 })).toEqual([
      { id: 'f3', status: 'ready', createdAt: 3 }, { id: 'f1', status: 'translated', createdAt: 1 },
    ]);
    expect(await files.count({ where: { status: 'ready' } })).toBe(1);
    const history = store.log('history:s1');
    expect(await history.append({ text: 'hello' })).toBe(1);
    expect(await history.read()).toEqual([{ seq: 1, value: { text: 'hello' } }]);
    expect(await history.last()).toEqual({ seq: 1, value: { text: 'hello' } });
    expect(history.truncateBefore(1)).toBeUndefined();
    expect(history.drop()).toBeUndefined();
    store.global.kv.set('settings', { theme: 'dark' });
    expect(await store.global.kv.get('settings')).toEqual({ theme: 'dark' });
    expect(await store.kv.get('settings')).toBeUndefined();
    expect(await commit(fixture, handlerStore(fixture))).toMatchObject({ committed: true });
  });
});
