import { describe, expect, it } from 'vitest';
import { z, type StoreIndexes } from '@kvman/sdk';
import { createStore } from '../../src/store/store.ts';
import { createIndexes, declaredIndexes, dropOtherIndexes, indexFor } from '../../src/store/indexes.ts';
import { useTemporaryHomes, type TestHome } from '../temporary-home.ts';

const newHome = useTemporaryHomes();

const anyDocument = z.record(z.string(), z.json());

// A store whose declared indexes exist, as a start leaves them (ADR 0088, 3).
function indexedStore(test: TestHome, indexes: StoreIndexes, extension = '@test/notes', workspaceId = 'home') {
  createIndexes(test.connection, declaredIndexes([{ name: extension, indexes }]));
  return createStore(test.connection, { extension, workspaceId, indexes }, test.ids);
}

const storeIndexes = (test: TestHome) =>
  test.connection.prepare<[], { name: string; sql: string }>("SELECT name, sql FROM sqlite_master WHERE type = 'index' AND name LIKE 'store_index_%' ORDER BY name").all();

const planOf = (test: TestHome, owner: string) =>
  test.connection
    .prepare<[string], { detail: string }>(
      `EXPLAIN QUERY PLAN SELECT id FROM store_documents INDEXED BY ${storeIndexes(test)[0]?.name ?? ''} WHERE extension = '@test/notes' AND scope = 'home' AND collection = 'notes' AND (json_type(data, '$."owner"') = 'text' AND json_extract(data, '$."owner"') = ?)`,
    )
    .all(owner)
    .map((row) => row.detail);

describe('store indexes (02 §2.5, ADR 0088, 3)', () => {
  it('QA56-H4 declared indexes are created with each field type and value', () => {
    const test = newHome();
    indexedStore(test, { notes: [['owner'], ['owner', 'tag']] });
    const found = storeIndexes(test);
    expect(found).toHaveLength(2);
    for (const index of found) {
      expect(index.sql).toContain(`json_type(data, '$."owner"'), json_extract(data, '$."owner"')`);
      expect(index.sql).toContain("WHERE extension = '@test/notes' AND collection = 'notes'");
    }
    expect(planOf(test, 'ana').join(' ')).toMatch(/USING (COVERING )?INDEX store_index_/);
  });

  it('QA56-H5 a lookup uses the index whose fields are the filter, else the longest leading match', () => {
    const declared = [['owner'], ['owner', 'tag'], ['size', 'owner']];
    expect(indexFor(declared, ['tag', 'owner'])).toEqual(['owner', 'tag']);
    expect(indexFor(declared, ['owner'])).toEqual(['owner']);
    expect(indexFor(declared, ['owner', 'size'])).toEqual(['size', 'owner']);
    expect(indexFor(declared, ['owner', 'kind'])).toEqual(['owner']);
    expect(indexFor([['owner', 'tag']], ['owner', 'kind'])).toEqual(['owner', 'tag']);
    expect(indexFor(declared, ['tag'])).toBeUndefined();
    expect(indexFor(declared, [])).toBeUndefined();
  });

  it('QA56-H6 an index changes no result', async () => {
    const test = newHome();
    const indexed = indexedStore(test, { notes: [['owner'], ['owner', 'tag']] }).collection('notes', anyDocument);
    const plain = createStore(test.connection, { extension: '@test/plain', workspaceId: 'home' }, test.ids).collection('notes', anyDocument);
    const documents: z.infer<typeof anyDocument>[] = Array.from({ length: 30 }, (_unused, index) => ({ owner: index % 3 === 0 ? 'ana' : 'bo', tag: index % 2 === 0 ? 'a' : 'b', rank: index }));
    for (const document of documents) {
      await indexed.insert(document);
      await plain.insert(document);
    }
    const shape = (list: readonly z.infer<typeof anyDocument>[]) => list.map(({ id: _id, ...rest }) => rest);
    for (const filter of [{ owner: 'ana' }, { owner: 'bo', tag: 'a' }, { tag: 'b' }, {}]) {
      for (const options of [{ limit: 5 }, { limit: 5, order: 'desc' as const }, { limit: 1000 }]) {
        expect(shape(await indexed.find(filter, options)), JSON.stringify([filter, options])).toEqual(shape(await plain.find(filter, options)));
      }
      expect(await indexed.count(filter)).toBe(await plain.count(filter));
    }
    const [firstPage, secondPage] = [await indexed.find({ owner: 'bo' }, { limit: 4 }), await plain.find({ owner: 'bo' }, { limit: 4 })];
    const after = { indexed: firstPage.at(-1)?.id ?? '', plain: secondPage.at(-1)?.id ?? '' };
    expect(shape(await indexed.find({ owner: 'bo' }, { limit: 4, after: after.indexed }))).toEqual(shape(await plain.find({ owner: 'bo' }, { limit: 4, after: after.plain })));
  });

  it('QA56-H7 kvman keeps exactly the declared store indexes, and no data changes', async () => {
    const test = newHome();
    const notes = indexedStore(test, { notes: [['owner'], ['tag']] }).collection('notes', anyDocument);
    await notes.insert({ owner: 'ana', tag: 'a' });
    const before = test.connection.prepare('SELECT * FROM store_documents').all();
    const kernelIndexes = () => test.connection.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'store_index_%'").all();
    const kept = kernelIndexes();
    const remaining = declaredIndexes([{ name: '@test/notes', indexes: { notes: [['owner']] } }]);
    dropOtherIndexes(test.connection, remaining);
    expect(storeIndexes(test)).toHaveLength(1);
    expect(kernelIndexes()).toEqual(kept);
    expect(test.connection.prepare('SELECT * FROM store_documents').all()).toEqual(before);
    dropOtherIndexes(test.connection, []);
    expect(storeIndexes(test)).toEqual([]);
  });

  it('QA56-E2 matches through an index keep JSON types', async () => {
    const test = newHome();
    const values = indexedStore(test, { values: [['n'], ['s'], ['o'], ['x']] }).collection('values', anyDocument);
    for (const document of [{ n: true }, { n: 1 }, { s: 5 }, { s: '5' }, { o: { a: 1 } }, { o: '{"a":1}' }, { x: null }, { y: 1 }]) await values.insert(document);
    expect((await values.find({ n: 1 }, { limit: 10 })).map(({ n }) => n)).toEqual([1]);
    expect((await values.find({ s: '5' }, { limit: 10 })).map(({ s }) => s)).toEqual(['5']);
    expect((await values.find({ o: '{"a":1}' }, { limit: 10 })).map(({ o }) => o)).toEqual(['{"a":1}']);
    expect(await values.count({ x: null })).toBe(1);
    expect(await values.count({ n: true })).toBe(1);
  });

  it('QA56-E3 a filter on an index leading fields returns id order', async () => {
    const test = newHome();
    const notes = indexedStore(test, { notes: [['owner', 'tag']] }).collection('notes', anyDocument);
    const ids: string[] = [];
    for (const tag of ['c', 'a', 'b', 'a', 'c']) ids.push((await notes.insert({ owner: 'ana', tag })).id);
    expect((await notes.find({ owner: 'ana' }, { limit: 10 })).map(({ id }) => id)).toEqual(ids);
    expect((await notes.find({ owner: 'ana' }, { limit: 10, order: 'desc' })).map(({ id }) => id)).toEqual(ids.toReversed());
    expect((await notes.find({ owner: 'ana' }, { limit: 2, after: ids[1] ?? '' })).map(({ id }) => id)).toEqual(ids.slice(2, 4));
  });

  it('QA56-E4 quotes in collection and field names are safe', async () => {
    const test = newHome();
    const odd = indexedStore(test, { "it's": [["o'wner", 'ta"g']] }).collection("it's", anyDocument);
    await odd.insert({ "o'wner": "a'na", 'ta"g': 'x"y' });
    await odd.insert({ "o'wner": 'bo', 'ta"g': 'x"y' });
    expect(await odd.find({ "o'wner": "a'na", 'ta"g': 'x"y' }, { limit: 10 })).toMatchObject([{ "o'wner": "a'na" }]);
    expect(await odd.count({ "o'wner": 'bo' })).toBe(1);
  });

  it('QA56-E5 an index serves every scope and only its own extension', async () => {
    const test = newHome();
    const indexes = { notes: [['owner']] };
    const store = indexedStore(test, indexes, '@test/notes', 'workspace-one');
    const other = indexedStore(test, indexes, '@test/other', 'workspace-one');
    await store.collection('notes', anyDocument).insert({ owner: 'ana', where: 'workspace' });
    await store.global.collection('notes', anyDocument).insert({ owner: 'ana', where: 'global' });
    await other.collection('notes', anyDocument).insert({ owner: 'ana', where: 'other' });
    expect((await store.collection('notes', anyDocument).find({ owner: 'ana' }, { limit: 10 })).map(({ where }) => where)).toEqual(['workspace']);
    expect((await store.global.collection('notes', anyDocument).find({ owner: 'ana' }, { limit: 10 })).map(({ where }) => where)).toEqual(['global']);
    expect(await store.transaction((tx) => tx.global.collection('notes', anyDocument).count({ owner: 'ana' }))).toBe(1);
  });
});
