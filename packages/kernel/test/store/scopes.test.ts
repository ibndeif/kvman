import { describe, expect, it } from 'vitest';
import { useTemporaryHomes } from '../temporary-home.ts';
import { note, storeOf } from './store-under-test.ts';

const newHome = useTemporaryHomes();

describe('store scopes (02 §2.5)', () => {
  it('M1.3-E8 each scope and each extension sees only its own data', async () => {
    const test = newHome();
    const home = storeOf(test, '@test/notes', 'home');
    const other = storeOf(test, '@test/notes', 'workspace-b');
    const otherExtension = storeOf(test, '@test/tasks', 'home');
    await home.collection('notes', note).insert({ text: 'home' });
    await other.collection('notes', note).insert({ text: 'workspace-b' });
    await home.global.collection('notes', note).insert({ text: 'global' });
    await otherExtension.collection('notes', note).insert({ text: 'tasks' });
    const texts = async (store: ReturnType<typeof storeOf>['global']) => (await store.collection('notes', note).find({}, { limit: 10 })).map((found) => found.text);
    expect(await texts(home)).toEqual(['home']);
    expect(await texts(other)).toEqual(['workspace-b']);
    expect(await texts(home.global)).toEqual(['global']);
    expect(await texts(other.global)).toEqual(['global']);
    expect(await texts(otherExtension)).toEqual(['tasks']);
    expect(await texts(otherExtension.global)).toEqual([]);
    await home.kv.set('key', 'home');
    await home.global.kv.set('key', 'global');
    expect(await other.kv.get('key')).toBeUndefined();
    expect(await other.global.kv.get('key')).toBe('global');
    expect(await otherExtension.global.kv.get('key')).toBeUndefined();
  });
});
