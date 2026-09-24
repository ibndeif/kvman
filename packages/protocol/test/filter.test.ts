import { describe, expect, it } from 'vitest';
import { filterSchema, matchesDocument, type Filter } from '../src/index.ts';

const report = { name: 'report.pdf', status: 'ready', size: 1200, pages: 3, tags: ['a', 'b'], shared: false, owner: null };
const invoice = { name: 'invoice.pdf', status: 'translated', size: 80, tags: [], shared: true };

type Row = { operator: string; filter: Filter; document: object; expected: boolean };

const table: Row[] = [
  { operator: 'eq (implicit)', filter: { status: 'ready' }, document: report, expected: true },
  { operator: 'eq (implicit)', filter: { status: 'ready' }, document: invoice, expected: false },
  { operator: 'eq', filter: { size: { eq: 1200 } }, document: report, expected: true },
  { operator: 'eq', filter: { shared: { eq: true } }, document: report, expected: false },
  { operator: 'ne', filter: { status: { ne: 'ready' } }, document: invoice, expected: true },
  { operator: 'ne', filter: { status: { ne: 'ready' } }, document: report, expected: false },
  { operator: 'gt', filter: { size: { gt: 1000 } }, document: report, expected: true },
  { operator: 'gt', filter: { size: { gt: 1200 } }, document: report, expected: false },
  { operator: 'gte', filter: { size: { gte: 1200 } }, document: report, expected: true },
  { operator: 'gte', filter: { size: { gte: 1201 } }, document: report, expected: false },
  { operator: 'lt', filter: { size: { lt: 100 } }, document: invoice, expected: true },
  { operator: 'lt', filter: { name: { lt: 'invoice.pdf' } }, document: invoice, expected: false },
  { operator: 'lte', filter: { name: { lte: 'invoice.pdf' } }, document: invoice, expected: true },
  { operator: 'lte', filter: { size: { lte: 79 } }, document: invoice, expected: false },
  { operator: 'in', filter: { status: { in: ['ready', 'failed'] } }, document: report, expected: true },
  { operator: 'in', filter: { status: { in: ['ready', 'failed'] } }, document: invoice, expected: false },
  { operator: 'prefix', filter: { name: { prefix: 'inv' } }, document: invoice, expected: true },
  { operator: 'prefix', filter: { name: { prefix: 'Inv' } }, document: invoice, expected: false },
  { operator: 'exists', filter: { pages: { exists: true } }, document: report, expected: true },
  { operator: 'exists', filter: { pages: { exists: true } }, document: invoice, expected: false },
  { operator: '$or', filter: { $or: [{ owner: 'me' }, { shared: true }] }, document: invoice, expected: true },
  { operator: '$or', filter: { $or: [{ owner: 'me' }, { shared: true }] }, document: report, expected: false },
];

function expectInvalid(filter: unknown, path: string): void {
  const result = filterSchema.safeParse(filter);
  expect(result.success, JSON.stringify(filter)).toBe(false);
  expect(result.error?.issues.map((issue) => issue.path.join('.'))).toContain(path);
}

describe('filter language (plan 04 §4.3, ADR 0008)', () => {
  it('M0.2-H4 the evaluator passes the table for every operator', () => {
    for (const row of table) {
      expect(filterSchema.parse(row.filter)).toEqual(row.filter);
      expect(matchesDocument(row.document, row.filter), `${row.operator} ${JSON.stringify(row.filter)}`).toBe(row.expected);
    }
    const covered = new Set(table.map((row) => row.operator));
    expect([...covered].sort()).toEqual(['$or', 'eq', 'eq (implicit)', 'exists', 'gt', 'gte', 'in', 'lt', 'lte', 'ne', 'prefix']);
  });

  it('M0.2-E31 missing and null fields behave the same', () => {
    for (const document of [{}, { owner: null }]) {
      expect(matchesDocument(document, { owner: null })).toBe(true);
      expect(matchesDocument(document, { owner: { eq: null } })).toBe(true);
      expect(matchesDocument(document, { owner: { exists: false } })).toBe(true);
      expect(matchesDocument(document, { owner: { exists: true } })).toBe(false);
      expect(matchesDocument(document, { owner: { ne: 'x' } })).toBe(true);
    }
  });

  it('M0.2-E32 ordered comparisons across types are false', () => {
    for (const value of ['1200', true, null, undefined, [1]]) {
      expect(matchesDocument({ size: value }, { size: { gt: 1 } }), String(value)).toBe(false);
      expect(matchesDocument({ size: value }, { size: { lt: 'z' } }), String(value)).toBe(value === '1200');
    }
  });

  it('M0.2-E33 strings compare by code point', () => {
    expect(matchesDocument({ mark: '😀' }, { mark: { gt: '～' } })).toBe(true);
    expect(matchesDocument({ mark: '～' }, { mark: { gt: '😀' } })).toBe(false);
  });

  it('M0.2-E34 in looks inside array fields and compares scalars', () => {
    expect(matchesDocument(report, { tags: { in: ['b', 'z'] } })).toBe(true);
    expect(matchesDocument(report, { tags: { in: ['z'] } })).toBe(false);
    expect(matchesDocument(invoice, { tags: { in: ['a'] } })).toBe(false);
    expect(matchesDocument(report, { pages: { in: [1, 3] } })).toBe(true);
  });

  it('M0.2-E35 dotted paths reach nested objects and arrays', () => {
    const document = { meta: { size: 5 }, items: [{ id: 'x' }, { id: 'y' }], title: 'plain' };
    expect(matchesDocument(document, { 'meta.size': { gte: 5 } })).toBe(true);
    expect(matchesDocument(document, { 'items.1.id': 'y' })).toBe(true);
    expect(matchesDocument(document, { 'title.length': { exists: true } })).toBe(false);
    expect(matchesDocument(document, { 'missing.deep': { exists: false } })).toBe(true);
    expect(matchesDocument(document, { 'items.01.id': { exists: true } })).toBe(false);
    expect(matchesDocument(document, { 'meta.constructor': { exists: true } })).toBe(false);
  });

  it('M0.2-E36 $or nests, an empty $or matches nothing, and {} matches everything', () => {
    const nested: Filter = { $or: [{ status: 'failed' }, { $or: [{ size: { lt: 10 } }, { name: { prefix: 'rep' } }] }] };
    expect(matchesDocument(report, nested)).toBe(true);
    expect(matchesDocument(invoice, nested)).toBe(false);
    expect(matchesDocument(report, { $or: [] })).toBe(false);
    expect(matchesDocument(report, {})).toBe(true);
  });

  it('M0.2-E37 several operators on one field are ANDed', () => {
    expect(matchesDocument({ size: 5 }, { size: { gt: 1, lt: 10 } })).toBe(true);
    expect(matchesDocument({ size: 50 }, { size: { gt: 1, lt: 10 } })).toBe(false);
  });

  it('M0.2-E38 malformed filters are rejected with the path of their field', () => {
    expectInvalid({ size: { between: [1, 2] } }, 'size');
    expectInvalid({ meta: { eq: { a: 1 } } }, 'meta');
    expectInvalid({ tags: { in: 'a' } }, 'tags');
    expectInvalid({ name: { prefix: 3 } }, 'name');
    expectInvalid({ pages: { exists: 'yes' } }, 'pages');
    expectInvalid({ $and: [] }, '$and');
    expectInvalid({ $or: [{ status: { bad: 1 } }] }, '$or.0.status');
  });

  it('M0.2-E39 no type coercion', () => {
    expect(matchesDocument({ size: 120 }, { size: { prefix: '12' } })).toBe(false);
    expect(matchesDocument({ size: '1' }, { size: 1 })).toBe(false);
  });
});
