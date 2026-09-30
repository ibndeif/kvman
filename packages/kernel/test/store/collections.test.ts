import { describe, expect, it } from 'vitest';
import { idSchema, z } from '@kvman/sdk';
import { useTemporaryHomes } from '../temporary-home.ts';
import { note, storeOf } from './store-under-test.ts';

const newHome = useTemporaryHomes();

describe('collections (02 §2.5, ADR 0009, 4)', () => {
  it('M1.3-H3 find needs a limit of at most 1000, orders by id, and count matches', async () => {
    const notes = storeOf(newHome()).collection('notes', note);
    for (const text of ['first', 'second', 'third']) await notes.insert({ text, done: false });
    const noLimit = { order: 'asc' } as unknown as { limit: number };
    await expect(notes.find({}, noLimit)).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED', params: { limit: 1000 } } });
    await expect(notes.find({}, { limit: 1001 })).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
    expect((await notes.find({ done: false }, { limit: 10, order: 'desc' })).map((found) => found.text)).toEqual(['third', 'second', 'first']);
    expect((await notes.find({ done: false }, { limit: 2 })).map((found) => found.text)).toEqual(['first', 'second']);
    expect(await notes.count({ done: false })).toBe(3);
    expect(await notes.count({ text: 'second' })).toBe(1);
  });

  it('M1.3-E3 insert returns the document with a UUIDv7 id; get of a missing id is undefined', async () => {
    const notes = storeOf(newHome()).collection('notes', note);
    const stored = await notes.insert({ text: 'hi' });
    expect(idSchema.safeParse(stored.id).success).toBe(true);
    expect(await notes.get(stored.id)).toEqual({ text: 'hi', id: stored.id });
    expect(await notes.get('0192a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b')).toBeUndefined();
  });

  it('M1.3-E4 a document that does not fit the schema fails, and unknown fields are dropped', async () => {
    const notes = storeOf(newHome()).collection('notes', note);
    const wrong = { text: 42 } as unknown as z.infer<typeof note>;
    await expect(notes.insert(wrong)).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED', params: { issues: [{ path: 'text' }] } } });
    const extra = { text: 'hi', color: 'red' } as z.infer<typeof note>;
    const stored = await notes.insert(extra);
    expect(await notes.get(stored.id)).toEqual({ text: 'hi', id: stored.id });
  });

  it('M1.3-E5 update merges top-level fields; update and delete of a missing id fail', async () => {
    const notes = storeOf(newHome()).collection('notes', note);
    const stored = await notes.insert({ text: 'hi', tag: 'a', rank: 1 });
    expect(await notes.update(stored.id, { tag: null, done: true })).toEqual({ text: 'hi', tag: null, rank: 1, done: true, id: stored.id });
    expect(await notes.get(stored.id)).toEqual({ text: 'hi', tag: null, rank: 1, done: true, id: stored.id });
    const missing = '0192a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
    await expect(notes.update(missing, { text: 'x' })).rejects.toMatchObject({ problem: { code: 'NOT_FOUND' } });
    await expect(notes.delete(missing)).rejects.toMatchObject({ problem: { code: 'NOT_FOUND' } });
    const breaking = { rank: 'high' } as unknown as Partial<z.infer<typeof note>>;
    await expect(notes.update(stored.id, breaking)).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
    expect((await notes.get(stored.id))?.rank).toBe(1);
    await notes.delete(stored.id);
    expect(await notes.get(stored.id)).toBeUndefined();
  });

  it('M1.3-E6 a stored document that no longer fits its schema fails on read', async () => {
    const store = storeOf(newHome());
    const stored = await store.collection('notes', note).insert({ text: 'hi' });
    const renamed = store.collection('notes', z.object({ title: z.string() }));
    await expect(renamed.get(stored.id)).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
    await expect(renamed.find({}, { limit: 10 })).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
  });

  it('M1.3-E7 filters are equality on strings, numbers, booleans, and null, combined with AND', async () => {
    const notes = storeOf(newHome()).collection('notes', note);
    await notes.insert({ text: 'a', done: true, rank: 1, tag: null });
    await notes.insert({ text: 'b', done: false, rank: 1, tag: 'x' });
    await notes.insert({ text: 'c', done: true, rank: 2 });
    const texts = async (filter: Parameters<typeof notes.find>[0]) => (await notes.find(filter, { limit: 10 })).map((found) => found.text);
    expect(await texts({ done: true })).toEqual(['a', 'c']);
    expect(await texts({ rank: 1 })).toEqual(['a', 'b']);
    expect(await texts({ tag: null })).toEqual(['a']);
    expect(await texts({ tag: 'x', rank: 1 })).toEqual(['b']);
    expect(await texts({ done: true, rank: 1 })).toEqual(['a']);
    const objectValue = { text: { equals: 'a' } } as unknown as Parameters<typeof notes.find>[0];
    await expect(notes.find(objectValue, { limit: 10 })).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
    await expect(notes.find({}, { limit: 2.5 })).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
  });
});
