import { describe, expect, it } from 'vitest';
import type { Json } from '@kvman/protocol';
import { mergePatch } from '../../src/index.ts';

const cases: Array<[Json, Json, Json]> = [
  [{ a: 'b' }, { a: 'c' }, { a: 'c' }],
  [{ a: 'b' }, { b: 'c' }, { a: 'b', b: 'c' }],
  [{ a: 'b' }, { a: null }, {}],
  [
    { a: 'b', b: 'c' },
    { a: null },
    { b: 'c' },
  ],
  [{ a: ['b'] }, { a: 'c' }, { a: 'c' }],
  [{ a: 'c' }, { a: ['b'] }, { a: ['b'] }],
  [{ a: { b: 'c' } }, { a: { b: 'd', c: null } }, { a: { b: 'd' } }],
  [{ a: [{ b: 'c' }] }, { a: [1] }, { a: [1] }],
  [['a', 'b'], ['c', 'd'], ['c', 'd']],
  [{ a: 'b' }, ['c'], ['c']],
  [{ a: 'foo' }, null, null],
  [{ a: 'foo' }, 'bar', 'bar'],
  [{ e: null }, { a: 1 }, { e: null, a: 1 }],
  [[1, 2], { a: 'b', c: null }, { a: 'b' }],
  [{}, { a: { bb: { ccc: null } } }, { a: { bb: {} } }],
];

describe('JSON Merge Patch (RFC 7396)', () => {
  it('M2.8-E2 merge applies the RFC 7396 appendix A examples without mutating its inputs', () => {
    for (const [target, patch, expected] of cases) {
      expect(mergePatch(target, patch)).toEqual(expected);
    }
    const target: Json = { a: { b: 'c', d: 'e' }, list: [1] };
    const patch: Json = { a: { b: 'd' }, list: [2] };
    mergePatch(target, patch);
    expect(target).toEqual({ a: { b: 'c', d: 'e' }, list: [1] });
    expect(patch).toEqual({ a: { b: 'd' }, list: [2] });
  });
});
