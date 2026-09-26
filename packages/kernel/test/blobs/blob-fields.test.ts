import { describe, expect, it } from 'vitest';
import type { JsonObject } from '@kvman/protocol';
import { blobIdsIn } from '../../src/index.ts';

const blob = (format = true): JsonObject => ({ type: 'string', pattern: '^[0-9a-f]{64}$', ...(format ? { format: 'kvman-blob-id' } : {}) });
const [one, two, three, four, five] = ['1'.repeat(64), '2'.repeat(64), '3'.repeat(64), '4'.repeat(64), '5'.repeat(64)] as const;

describe('blob fields found by schema (plan 04 §4.6, ADR 0134)', () => {
  it('M2.5-E12 every z.blobId() field is found once, plain strings are not, and unions read every branch', () => {
    const schema: JsonObject = {
      type: 'object',
      properties: {
        a: blob(), plain: blob(false), list: { type: 'array', items: blob() }, maybe: { anyOf: [blob(), { type: 'null' }] },
        either: { anyOf: [{ type: 'object', properties: { x: blob() } }, { type: 'string' }] },
        byName: { type: 'object', additionalProperties: blob() }, tree: { $ref: '#/$defs/node' }, again: blob(),
      },
      $defs: { node: { type: 'object', properties: { blob: blob(), children: { type: 'array', items: { $ref: '#/$defs/node' } } } } },
    };
    const value = {
      a: one, plain: five, list: [two, one], maybe: null, either: { x: three }, byName: { k: four },
      tree: { blob: two, children: [{ blob: three, children: [] }] }, again: one,
    };
    expect(blobIdsIn(schema, value).sort()).toEqual([one, two, three, four].sort());
    expect(blobIdsIn(schema, { ...value, either: five, maybe: five })).toContain(five);
    expect(blobIdsIn(undefined, value)).toEqual([]);
    const looping: JsonObject = { $ref: '#', anyOf: [{ $ref: '#' }] };
    expect(blobIdsIn(looping, one)).toEqual([]);
  });
});
