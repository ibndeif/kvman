import { describe, expect, it } from 'vitest';
import type { Json } from '@kvman/sdk';
import { invalidPayloadOutput, payloadSignature } from '../../src/connector-call.ts';

// A payload's signature, written from its JSON Schema (plan 08 §8.3, ADR 0012, 3 and 4).

describe('the payload signature (ADR 0012, 3)', () => {
  it('QA19-H2 a signature is written from a JSON Schema', () => {
    const schema: Json = {
      type: 'object',
      properties: {
        a: { type: 'string' },
        b: { type: 'number' },
        c: { type: 'array', items: { type: 'object', properties: { x: { type: 'string' }, y: { type: 'string' } }, required: ['x'] } },
        d: { type: 'object', properties: { p: { type: 'string' } }, required: ['p'] },
        mode: { type: 'string', enum: ['fresh', 'fork'] },
        format: { type: 'string', enum: ['markdown', 'html'] },
        n: { type: 'number' },
        danger: { type: 'boolean' },
        connectors: { type: 'array', items: { type: 'string' } },
        priority: { enum: [1, 2, 3] },
      },
      required: ['a', 'c', 'd', 'mode', 'n', 'danger', 'connectors', 'priority'],
    };
    expect(payloadSignature(schema)).toBe('{ a, b?, c: [{ x, y? }], d: { p }, mode: "fresh" | "fork", format?: "markdown" | "html", n, danger, connectors, priority }');
    expect(payloadSignature({ type: 'object', properties: {} })).toBe('{}');
  });

  it('QA19-E4 a schema with no signature', () => {
    expect(payloadSignature({ anyOf: [{ type: 'string' }, { type: 'number' }] })).toBeUndefined();
    expect(payloadSignature({ type: 'string' })).toBeUndefined();
    expect(payloadSignature({ type: 'object' })).toBeUndefined();
    expect(payloadSignature(undefined)).toBeUndefined();
    const schema: Json = { $schema: 'https://json-schema.org/draft/2020-12/schema', anyOf: [{ type: 'string' }, { type: 'number' }] };
    const { exitCode, output } = invalidPayloadOutput({ connector: 'notes', command: 'add' }, [{ path: 'tags', message: 'Required' }], schema);
    expect(exitCode).toBe(1);
    expect(output).toBe(`error VALIDATION_FAILED: tags: Required. The payload of notes add is (JSON Schema):\n${JSON.stringify({ anyOf: [{ type: 'string' }, { type: 'number' }] })}`);
    expect(output).not.toContain('$schema');
  });

  it('QA19-E5 a problem at the payload\'s root', () => {
    expect(invalidPayloadOutput({ connector: 'fs', command: 'write' }, [{ path: '', message: 'Expected object' }], undefined).output).toBe('error VALIDATION_FAILED: payload: Expected object.');
    expect(
      invalidPayloadOutput(
        { connector: 'fs', command: 'write' },
        [
          { path: '', message: 'Expected object' },
          { path: 'path', message: 'Required' },
        ],
        undefined,
      ).output,
    ).toBe('error VALIDATION_FAILED: payload: Expected object; path: Required.');
  });
});
