import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { schemaGetRequestSchema, validateRequestSchema, validateResultSchema } from '../src/index.ts';

const workspaceId = 'a'.repeat(64);

describe('kernel query shapes (plan 03 §3.8, ADRs 0110, 0111, 0112)', () => {
  it('M2.1-E45 validate takes exactly one input; schema.get refuses a blank q; both convert to JSON Schema', () => {
    for (const field of ['manifest', 'preset', 'page', 'catalog']) {
      expect(validateRequestSchema.safeParse({ [field]: {}, workspaceId }).success).toBe(true);
    }
    expect(validateRequestSchema.safeParse({}).success).toBe(false);
    expect(validateRequestSchema.safeParse({ manifest: {}, page: {} }).success).toBe(false);
    expect(validateResultSchema.safeParse({ ok: true, issues: [{ path: 'a', message: 'b', severity: 'warning' }] }).success).toBe(true);
    expect(schemaGetRequestSchema.safeParse({ q: 'pdf', workspaceId }).success).toBe(true);
    expect(schemaGetRequestSchema.safeParse({ q: '  ' }).success).toBe(false);
    expect(schemaGetRequestSchema.safeParse({ color: 'red' }).success).toBe(false);
    for (const schema of [validateRequestSchema, validateResultSchema, schemaGetRequestSchema]) {
      expect(() => z.toJSONSchema(schema, { io: 'input' })).not.toThrow();
    }
  });
});
