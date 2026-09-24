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
});
