import { matchesDocument, type Filter, type JsonObject } from '@kvman/protocol';
import { describe, expect, it } from 'vitest';
import { compareDocuments, documentFindStatement } from '../../src/index.ts';
import { rows, workspaceId } from '../storage/harness.ts';
import { handlerStore, openStoreFixture, owner, seedDocuments, type StoreFixture } from './harness.ts';

const documents: JsonObject[] = [
  { id: 'r', name: 'report.pdf', status: 'ready', size: 1200, pages: 3, tags: ['a', 'b'], shared: false, owner: null, meta: { size: 5 }, items: [{ id: 'x' }, { id: 'y' }] },
  { id: 'i', name: 'invoice.pdf', status: 'translated', size: 80, tags: [], shared: true },
  { id: 'n', size: '1200', mark: '😀', flag: true, keyed: { '0': 'zero' }, tags: ['z', null] },
  { id: 'm', mark: '～', size: 1, tags: 'a', meta: 'flat' },
  { id: 'e' },
];

const filters: Filter[] = [
  {}, { status: 'ready' }, { size: { eq: 1200 } }, { shared: { eq: true } }, { shared: false }, { status: { ne: 'ready' } },
  { size: { gt: 1000 } }, { size: { gte: 80, lte: 1200 } }, { size: { lt: 'z' } }, { name: { lt: 'invoice.pdf' } },
  { status: { in: ['ready', 'failed'] } }, { tags: { in: ['b', 'z'] } }, { tags: { in: ['a'] } }, { tags: { in: [null] } },
  { name: { prefix: 'inv' } }, { size: { prefix: '12' } }, { pages: { exists: true } }, { owner: null }, { owner: { exists: false } },
  { owner: { ne: 'x' } }, { mark: { gt: '～' } }, { 'meta.size': { gte: 5 } }, { 'items.1.id': 'y' }, { 'keyed.0': 'zero' },
  { 'meta.size': { exists: false } }, { $or: [{ status: 'failed' }, { $or: [{ size: { lt: 10 } }, { name: { prefix: 'rep' } }] }] },
  { $or: [] }, { flag: true, size: '1200' },
];

async function fixtureWith(data: JsonObject[]): Promise<StoreFixture> {
  const fixture = openStoreFixture();
  await seedDocuments(fixture, 'records', data.map((document) => ({ ...document, fileId: String(document['id']) })));
  return fixture;
}

describe('filters and ordering in SQL (ADRs 0008, 0036, 0038)', () => {
  it('M1.2-E1 SQL returns exactly what the protocol evaluator matches', async () => {
    const fixture = await fixtureWith(documents);
    const records = handlerStore(fixture).store.collection('records');
    for (const where of filters) {
      const expected = documents.filter((document) => matchesDocument(document, where)).map((document) => document['id']).sort();
      const found = (await records.find({ where })).map((document) => document['id']).sort();
      expect(found, JSON.stringify(where)).toEqual(expected);
      expect(await records.count({ where }), JSON.stringify(where)).toBe(expected.length);
    }
  });

  it('M1.2-E2 order by type rank, then value, then id, with and without pending writes', async () => {
    const values = [undefined, null, false, true, 2, 1, 'b', 'a', { x: 1 }, [1], 1];
    const data: JsonObject[] = values.map((value, index) => (value === undefined ? { id: `d${index}` } : { id: `d${index}`, v: value }));
    const fixture = await fixtureWith(data);
    for (const direction of ['asc', 'desc'] as const) {
      const expected = [...data].map((document) => ({ id: String(document['id']), data: document })).sort(compareDocuments([['v', direction]])).map((entry) => entry.id);
      const records = handlerStore(fixture).store.collection('records');
      expect((await records.find({ orderBy: [['v', direction]] })).map((document) => document['id']), direction).toEqual(expected);
      records.put({ id: 'd99', fileId: 'd99', v: 1 });
      const withPending = [...data, { id: 'd99', v: 1 }].map((document) => ({ id: String(document['id']), data: document })).sort(compareDocuments([['v', direction]])).map((entry) => entry.id);
      expect((await records.find({ orderBy: [['v', direction]] })).map((document) => document['id']), `${direction} pending`).toEqual(withPending);
    }
    expect(compareDocuments([['v', 'asc']])({ id: 'b', data: { v: 1 } }, { id: 'a', data: { v: 1 } })).toBeGreaterThan(0);
  });

  it('M1.2-E3 field names that need quoting work; a double quote is refused', async () => {
    const fixture = await fixtureWith([{ id: 'q', 'created-at': 2, 'my field': 'x', snake_case: true }, { id: 'w', 'created-at': 1 }]);
    const records = handlerStore(fixture).store.collection('records');
    expect((await records.find({ where: { 'my field': 'x', snake_case: true } })).map((document) => document['id'])).toEqual(['q']);
    expect((await records.find({ orderBy: [['created-at', 'asc']] })).map((document) => document['id'])).toEqual(['w', 'q']);
    await expect(records.find({ where: { 'say "hi"': 1 } })).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
  });

  it('M1.2-E4 declared indexes are partial expression indexes the planner uses once it has statistics', async () => {
    const fixture = openStoreFixture();
    await seedDocuments(fixture, 'files', Array.from({ length: 2000 }, (_, index) => ({ id: `f${index}`, status: index % 20 === 0 ? 'ready' : 'done', createdAt: index })));
    fixture.connection.exec('PRAGMA optimize = 0x10002');
    const [index] = rows(fixture.connection, "SELECT sql FROM sqlite_master WHERE type = 'index' AND sql LIKE '%json_extract%'");
    expect(String(index?.['sql'])).toContain("WHERE owner = '@acme/pdf' AND collection = 'files'");
    const statement = documentFindStatement(owner, workspaceId, 'files', { where: { status: 'ready' }, orderBy: [], limit: 10 });
    const plan = rows(fixture.connection, `EXPLAIN QUERY PLAN ${statement.sql}`, ...statement.params.map((value) => (typeof value === 'bigint' ? Number(value) : (value ?? ''))));
    expect(plan.map((step) => String(step['detail'])).join(' ')).toMatch(/USING INDEX docs_/);
  });

  it('M1.2-E5 unindexed finds are capped at 10,000 scanned documents and warn once', async () => {
    const small = await fixtureWith([{ id: 'a', name: 'x' }]);
    const records = handlerStore(small).store.collection('records');
    await records.find({ where: { name: 'x' } });
    await records.find({ where: { name: 'x' } });
    expect(small.warnings).toEqual([{ owner, collection: 'records', shape: JSON.stringify([['name'], []]) }]);
    const large = openStoreFixture();
    const insert = large.connection.prepare('INSERT INTO docs (owner, ws, collection, id, data, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, 0, 0)');
    large.connection.exec('BEGIN');
    for (let index = 0; index < 10_001; index += 1) insert.run(owner, workspaceId, 'files', `f${index}`, JSON.stringify({ id: `f${index}`, status: 'ready', name: `n${index}` }));
    large.connection.exec('COMMIT');
    const files = handlerStore(large).store.collection('files');
    await expect(files.find({ where: { name: 'n1' } })).rejects.toMatchObject({ problem: { code: 'STORE_RESULT_TOO_LARGE' } });
    expect(await files.find({ where: { status: 'ready' }, limit: 3 })).toHaveLength(3);
  });
});
