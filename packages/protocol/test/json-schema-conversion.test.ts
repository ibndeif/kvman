import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { toJsonSchemaDocument } from '../src/index.ts';

describe('JSON Schema conversion (ADR 0047)', () => {
  it('M1.3-E14 converts with descriptions and meta; reports a transform instead of throwing', () => {
    const settings = z.object({ language: z.string().describe('Target language code').meta({ label: '$t.settings.language' }) });
    expect(toJsonSchemaDocument(settings)).toEqual({
      ok: true,
      document: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: { language: { type: 'string', description: 'Target language code', label: '$t.settings.language' } },
        required: ['language'],
        additionalProperties: false,
      },
    });
    const transformed = toJsonSchemaDocument(z.object({ count: z.string().transform((value) => value.length) }));
    expect(transformed.ok).toBe(false);
    expect(transformed).toMatchObject({ message: expect.stringMatching(/transform/i) });
  });

  it('M2.1-E43 reports pipes, preprocess, codecs, and input-view transforms with their path', () => {
    const lossy = [
      z.object({ a: z.string().pipe(z.string().min(1)) }),
      z.object({ a: z.preprocess((value) => value, z.string()) }),
      z.object({ a: z.codec(z.string(), z.number(), { decode: Number, encode: String }) }),
    ];
    for (const schema of lossy) {
      for (const view of ['input', 'output'] as const) {
        expect(toJsonSchemaDocument(schema, view)).toEqual({ ok: false, message: 'a pipe, transform, preprocess, or codec at properties.a cannot be enforced by JSON Schema' });
      }
    }
    expect(toJsonSchemaDocument(z.object({ a: z.string().transform((value) => value.length) }), 'input')).toMatchObject({ ok: false, message: expect.stringContaining('properties.a') });
    const plain = z.object({ a: z.string().default('x'), b: z.lazy(() => z.number()), c: z.string().refine((value) => value !== 'no') });
    expect(toJsonSchemaDocument(plain, 'input').ok).toBe(true);
    expect(toJsonSchemaDocument(plain, 'output').ok).toBe(true);
  });
});
