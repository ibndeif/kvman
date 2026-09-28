import { PayloadValidators } from '../../src/router/payload-validators.ts';
import { lookupPath } from '../../src/validation/schema-paths.ts';
import { valueIssues } from '../../src/ui/value-checks.ts';
import { describe, expect, it } from 'vitest';

describe('binding paths and bound values (ADRs 0109, 0157)', () => {
  it('M2.10-E40 paths follow ADR 0109 with indexes and length; literals check, bindings pass', () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        tags: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' } } } },
      },
    };
    expect(lookupPath(schema, ['name'], { arrays: true }).found).toBe(true);
    expect(lookupPath(schema, ['tags', '0', 'id'], { arrays: true }).found).toBe(true);
    expect(lookupPath(schema, ['tags', 'length'], { arrays: true }).found).toBe(true);
    expect(lookupPath(schema, ['nope'], { arrays: true })).toEqual({ found: false, fields: ['name', 'tags'] });
    const withRef = { $defs: { file: { type: 'object', properties: { id: { type: 'string' } } } }, $ref: '#/$defs/file' };
    expect(lookupPath(withRef, ['id'], { arrays: true }).found).toBe(true);
    const union = { anyOf: [{ type: 'object', properties: { url: { type: 'string' } } }, { type: 'object', properties: { id: { type: 'string' } } }] };
    expect(lookupPath(union, ['url'], { arrays: true }).found).toBe(true);
    const open = { type: 'object', properties: { id: { type: 'string' } }, additionalProperties: { type: 'string' } };
    expect(lookupPath(open, ['anything'], { arrays: true }).found).toBe(true);
    const validators = new PayloadValidators();
    const counted = { type: 'object', properties: { count: { type: 'number' } } };
    expect(valueIssues(validators, { schema: counted, value: { count: 'x' }, root: 'props' })).toEqual([
      { path: 'props.count', message: 'must be number' },
    ]);
    expect(valueIssues(validators, { schema: counted, value: { count: '$item.pages' }, root: 'props' })).toEqual([]);
    expect(valueIssues(validators, { schema: counted, value: { count: '{{ $item.pages }}' }, root: 'props' })).toEqual([]);
    const either = { anyOf: [{ type: 'object', properties: { n: { type: 'number' } }, required: ['n'] }, { type: 'object', properties: { s: { type: 'string' } }, required: ['s'] }] };
    expect(valueIssues(validators, { schema: either, value: { n: '$item.pages' }, root: 'props' })).toEqual([]);
    expect(valueIssues(validators, { schema: either, value: { n: 'many' }, root: 'props' })).toEqual([{ path: 'props', message: 'must match a schema in anyOf' }]);
  });
});
