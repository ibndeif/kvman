import { describe, expect, it } from 'vitest';
import { z, type FindOptions } from '@kvman/sdk';
import { useTemporaryHomes } from '../temporary-home.ts';
import { note, storeOf } from './store-under-test.ts';

const newHome = useTemporaryHomes();
const orders = ['asc', 'desc'] as const;
const modes = ['ordinary', 'transaction'] as const;
const invalidOptions = [
  { name: 'empty after', value: { limit: 2, after: '' } },
  { name: 'null after', value: { limit: 2, after: null } },
  { name: 'number after', value: { limit: 2, after: 42 } },
  { name: 'boolean after', value: { limit: 2, after: true } },
  { name: 'array after', value: { limit: 2, after: [] } },
  { name: 'object after', value: { limit: 2, after: {} } },
  { name: 'invalid order', value: { limit: 2, order: 'sideways' } },
  { name: 'SQL-looking order', value: { limit: 2, order: 'asc; DROP TABLE store_documents; --' } },
  { name: 'null order', value: { limit: 2, order: null } },
  { name: 'missing limit', value: {} },
  { name: 'zero limit', value: { limit: 0 } },
  { name: 'negative limit', value: { limit: -1 } },
  { name: 'fractional limit', value: { limit: 1.5 } },
  { name: 'oversized limit', value: { limit: 1001 } },
  { name: 'string limit', value: { limit: '2' } },
  { name: 'null limit', value: { limit: null } },
  { name: 'unknown option', value: { limit: 2, offset: 1 } },
];

function idsOf(rows: readonly { id: string }[]): string[] {
  return rows.map((row) => row.id);
}

function lastId(rows: readonly { id: string }[]): string {
  const last = rows.at(-1);
  if (last === undefined) throw new Error('Expected a nonempty page');
  return last.id;
}

describe('collection continuation (ADR0040)', () => {
  it.each(['default', ...orders] as const)('M1.3-E19 %s pages preserve order and exclude every boundary', async (order) => {
    const notes = storeOf(newHome()).collection('notes', note);
    const inserted = [];
    for (const text of ['one', 'two', 'three', 'four', 'five']) inserted.push(await notes.insert({ text }));
    const expected = order === 'desc' ? idsOf(inserted).reverse() : idsOf(inserted);
    const seen: string[] = [];
    let after: string | undefined;
    for (let pageNumber = 0; pageNumber < 4; pageNumber += 1) {
      const options = { limit: 2, ...(order === 'default' ? {} : { order }), ...(after === undefined ? {} : { after }) };
      const page = await notes.find({}, options);
      expect(idsOf(page)).toEqual(expected.slice(pageNumber * 2, pageNumber * 2 + 2));
      if (after !== undefined) expect(idsOf(page)).not.toContain(after);
      seen.push(...idsOf(page));
      if (page.length > 0) after = lastId(page);
    }
    expect(seen).toEqual(expected);
    expect(new Set(seen).size).toBe(5);
  });

  it('M1.3-E20 limit1000 pages enumerate all 1005 IDs exactly once and then finish', async () => {
    const store = storeOf(newHome());
    const inserted = await store.transaction((tx) => {
      const notes = tx.collection('notes', note);
      return Array.from({ length: 1005 }, (_, index) => notes.insert({ text: `note-${index}`, done: true }));
    });
    const notes = store.collection('notes', note);
    expect(await notes.count({ done: true })).toBe(1005);
    const first = await notes.find({ done: true }, { limit: 1000 });
    expect(idsOf(first)).toEqual(idsOf(inserted).slice(0, 1000));
    const continuation = { limit: 1000, after: lastId(first) };
    const second = await notes.find({ done: true }, continuation);
    expect(idsOf(second)).toEqual(idsOf(inserted).slice(1000));
    const end = { limit: 1000, after: lastId(second) };
    expect(await notes.find({ done: true }, end)).toEqual([]);
    expect(idsOf([...first, ...second])).toEqual(idsOf(inserted));
    expect(new Set(idsOf([...first, ...second])).size).toBe(1005);
    expect(await notes.count({ done: true })).toBe(1005);
    await expect(notes.find({}, { limit: 1001 })).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
  });

  it.each(orders)('M1.3-E21 %s continuation on an empty collection returns an array', async (order) => {
    const notes = storeOf(newHome()).collection('notes', note);
    const options = { limit: 2, order, after: '0192a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b' };
    expect(await notes.find({}, options)).toEqual([]);
  });

  it.each(orders)('M1.3-E21 %s deleted and nonexistent positions need no cursor row', async (order) => {
    const home = newHome();
    const notes = storeOf(home).collection('notes', note);
    const first = await notes.insert({ text: 'first' });
    const gap = home.ids();
    const boundary = await notes.insert({ text: 'boundary' });
    const last = await notes.insert({ text: 'last' });
    expect(idsOf(await notes.find({}, { limit: 2, order }))).toEqual([order === 'asc' ? first.id : last.id, boundary.id]);
    await notes.delete(boundary.id);
    expect(await notes.get(boundary.id)).toBeUndefined();
    expect(await notes.get(gap)).toBeUndefined();
    for (const after of [boundary.id, gap]) {
      const options = { limit: 10, order, after };
      expect(idsOf(await notes.find({}, options))).toEqual([order === 'asc' ? last.id : first.id]);
    }
    const low = { limit: 10, order, after: '00000000-0000-7000-8000-000000000000' };
    const high = { limit: 10, order, after: 'ffffffff-ffff-7fff-bfff-ffffffffffff' };
    expect(idsOf(await notes.find({}, low))).toEqual(order === 'asc' ? [first.id, last.id] : []);
    expect(idsOf(await notes.find({}, high))).toEqual(order === 'desc' ? [last.id, first.id] : []);
  });

  it.each(orders)('M1.3-E22 %s cursor combines with equality AND; null excludes missing and count stays total', async (order) => {
    const notes = storeOf(newHome()).collection('notes', note);
    const filter = { text: 'match', done: true, rank: 1, tag: null };
    const first = await notes.insert(filter);
    await notes.insert({ text: 'match', done: true, rank: 1 });
    await notes.insert({ ...filter, text: 'other' });
    await notes.insert({ ...filter, done: false });
    await notes.insert({ ...filter, rank: 2 });
    await notes.insert({ ...filter, tag: 'not-null' });
    const second = await notes.insert(filter);
    const third = await notes.insert(filter);
    expect(await notes.count({ tag: null })).toBe(6);
    expect(await notes.count(filter)).toBe(3);
    const expected = order === 'asc' ? [first.id, second.id, third.id] : [third.id, second.id, first.id];
    expect(idsOf(await notes.find(filter, { limit: 10, order }))).toEqual(expected);
    const after = order === 'asc' ? first.id : third.id;
    const options = { limit: 1, order, after };
    const page = await notes.find(filter, options);
    expect(idsOf(page)).toEqual([second.id]);
    const remaining = { limit: 10, order, after: lastId(page) };
    expect(idsOf(await notes.find(filter, remaining))).toEqual([order === 'asc' ? third.id : first.id]);
    expect(await notes.count(filter)).toBe(3);
    expect(await notes.count({ tag: null })).toBe(6);
  });

  describe.each(modes)('%s return style', (mode) => {
    it.each(orders.flatMap((order) => ['gap', 'SQL-low', 'SQL-high'].map((position) => ({ order, position }))))(
      'M1.3-E23 $order $position keeps workspace/global/extension ownership and SQL value binding',
      async ({ order, position }) => {
        const home = newHome();
        const workspace = storeOf(home, '@test/notes', 'workspace-a');
        const otherWorkspace = storeOf(home, '@test/notes', 'workspace-b');
        const otherExtension = storeOf(home, '@test/tasks', 'workspace-a');
        const owners = [
          { store: workspace, global: false, name: 'notes' }, { store: workspace, global: true, name: 'notes' },
          { store: otherWorkspace, global: false, name: 'notes' }, { store: otherExtension, global: false, name: 'notes' },
          { store: otherExtension, global: true, name: 'notes' }, { store: workspace, global: false, name: 'other-notes' },
        ];
        const firstIds: string[] = [];
        const secondIds: string[] = [];
        for (const owner of owners) {
          firstIds.push((await (owner.global ? owner.store.global : owner.store).collection(owner.name, note).insert({ text: 'first' })).id);
        }
        const gap = home.ids();
        for (const owner of owners) {
          secondIds.push((await (owner.global ? owner.store.global : owner.store).collection(owner.name, note).insert({ text: 'second' })).id);
        }
        const after = position === 'gap' ? gap : position === 'SQL-low' ? "' OR 1=1; DROP TABLE store_documents; --" : "z' OR 1=1 --";
        const options = { limit: 10, order, after };
        for (const [index, owner] of owners.entries()) {
          const expected = position === 'gap' ? [order === 'asc' ? secondIds[index] : firstIds[index]]
            : position === 'SQL-low' ? (order === 'asc' ? [firstIds[index], secondIds[index]] : [])
              : order === 'desc' ? [secondIds[index], firstIds[index]] : [];
          if (mode === 'ordinary') {
            const result = (owner.global ? owner.store.global : owner.store).collection(owner.name, note).find({}, options);
            expect(result).toBeInstanceOf(Promise);
            const rows = await result;
            expect(Array.isArray(rows)).toBe(true);
            expect(idsOf(rows)).toEqual(expected);
          } else {
            await owner.store.transaction((tx) => {
              const rows = (owner.global ? tx.global : tx).collection(owner.name, note).find({}, options);
              expect(Array.isArray(rows)).toBe(true);
              expect(idsOf(rows)).toEqual(expected);
            });
          }
          expect(await (owner.global ? owner.store.global : owner.store).collection(owner.name, note).count({})).toBe(2);
        }
      },
    );

    it.each(invalidOptions)('M1.3-E24 $name fails VALIDATION_FAILED without changing data', async ({ value }) => {
      const store = storeOf(newHome());
      const notes = store.collection('notes', note);
      const first = await notes.insert({ text: 'first', tag: null });
      const second = await notes.insert({ text: 'second', done: false });
      const options = value as unknown as FindOptions;
      const result = mode === 'ordinary' ? notes.find({}, options)
        : store.transaction((tx) => tx.collection('notes', note).find({}, options));
      await expect(result).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
      expect(await notes.find({}, { limit: 10 })).toEqual([first, second]);
      expect(await notes.count({})).toBe(2);
    });

    it('M1.3-E24 valid calls without after retain default/desc order and array returns', async () => {
      const store = storeOf(newHome());
      const notes = store.collection('notes', note);
      const first = await notes.insert({ text: 'first' });
      const second = await notes.insert({ text: 'second' });
      if (mode === 'ordinary') {
        const result = notes.find({}, { limit: 1 });
        expect(result).toBeInstanceOf(Promise);
        expect(await result).toEqual([first]);
        expect(await notes.find({}, { limit: 2, order: 'desc' })).toEqual([second, first]);
      } else {
        await store.transaction((tx) => {
          const collection = tx.collection('notes', note);
          const result = collection.find({}, { limit: 1 });
          expect(Array.isArray(result)).toBe(true);
          expect(result).toEqual([first]);
          expect(collection.find({}, { limit: 2, order: 'desc' })).toEqual([second, first]);
        });
      }
    });
  });

  it.each(modes)('M1.3-E26 %s cursor reads still validate stored documents', async (mode) => {
    const store = storeOf(newHome());
    const notes = store.collection('notes', note);
    const boundary = await notes.insert({ text: 'boundary' });
    const next = await notes.insert({ text: 'next' });
    const options = { limit: 1, after: boundary.id };
    expect(await notes.find({}, options)).toEqual([next]);
    const incompatible = z.object({ rank: z.number() });
    const result = mode === 'ordinary' ? store.collection('notes', incompatible).find({}, options)
      : store.transaction((tx) => {
        expect(tx.collection('notes', note).find({}, options)).toEqual([next]);
        return tx.collection('notes', incompatible).find({}, options);
      });
    await expect(result).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
  });

  it('M1.3-E27 invalid after rolls back an earlier transaction write', async () => {
    const store = storeOf(newHome());
    const notes = store.collection('notes', note);
    const seed = await notes.insert({ text: 'seed' });
    await expect(store.transaction((tx) => {
      const collection = tx.collection('notes', note);
      collection.insert({ text: 'rolled back' });
      return collection.find({}, { limit: 1, after: '' });
    })).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
    expect(await notes.find({}, { limit: 10 })).toEqual([seed]);
    expect(await notes.count({})).toBe(1);
  });

  it('M1.3-E25 later pages see unread deletion and new IDs, not a snapshot or repeated updated rows', async () => {
    const notes = storeOf(newHome()).collection('notes', note);
    const first = await notes.insert({ text: 'first', done: true });
    const boundary = await notes.insert({ text: 'boundary', done: true });
    const unread = await notes.insert({ text: 'deleted', done: true });
    const survivor = await notes.insert({ text: 'survivor', done: true });
    const page = await notes.find({ done: true }, { limit: 2 });
    expect(idsOf(page)).toEqual([first.id, boundary.id]);
    await notes.delete(unread.id);
    await notes.delete(boundary.id);
    await notes.update(first.id, { text: 'updated behind cursor' });
    const added = await notes.insert({ text: 'new beyond cursor', done: true });
    expect(added.id > boundary.id).toBe(true);
    const options = { limit: 2, after: lastId(page) };
    const next = await notes.find({ done: true }, options);
    expect(idsOf(next)).toEqual([survivor.id, added.id]);
    expect(new Set(idsOf([...page, ...next])).size).toBe(4);
    const end = { limit: 2, after: lastId(next) };
    expect(await notes.find({ done: true }, end)).toEqual([]);
    expect(await notes.count({ done: true })).toBe(3);
  });
});
