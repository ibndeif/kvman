import { describe, expect, it } from 'vitest';
import { useTemporaryHomes } from '../temporary-home.ts';
import { note, storeOf } from './store-under-test.ts';

const newHome = useTemporaryHomes();

describe('transactions (02 §2.5)', () => {
  it('M1.3-H2 an async transaction callback rolls back with VALIDATION_FAILED', async () => {
    const store = storeOf(newHome());
    const asyncCallback = store.transaction(async (tx) => {
      tx.collection('notes', note).insert({ text: 'lost' });
    });
    await expect(asyncCallback).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
    expect(await store.collection('notes', note).count({})).toBe(0);
  });

  it('M1.3-E9 writes to the workspace and to tx.global commit together, and a throw rolls both back', async () => {
    const store = storeOf(newHome());
    const result = await store.transaction((tx) => {
      const stored = tx.collection('notes', note).insert({ text: 'workspace' });
      tx.global.kv.set('last', stored.id);
      return tx.collection('notes', note).count({});
    });
    expect(result).toBe(1);
    expect(await store.global.kv.get('last')).toEqual(expect.any(String));
    const failing = store.transaction((tx) => {
      tx.collection('notes', note).insert({ text: 'rolled back' });
      tx.global.kv.set('last', 'rolled back');
      throw new Error('stop');
    });
    await expect(failing).rejects.toThrow('stop');
    expect(await store.collection('notes', note).count({})).toBe(1);
    expect(await store.global.kv.get('last')).not.toBe('rolled back');
  });
});
