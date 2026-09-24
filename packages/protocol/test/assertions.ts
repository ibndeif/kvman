import { expect } from 'vitest';
import type { z } from 'zod';

export function expectRoundTrip(schema: z.ZodType, fixture: unknown): void {
  const parsed = schema.parse(fixture);
  expect(parsed).toEqual(fixture);
  expect(JSON.parse(JSON.stringify(parsed))).toEqual(fixture);
}

export function issuePaths(schema: z.ZodType, value: unknown): string[] {
  const result = schema.safeParse(value);
  expect(result.success, JSON.stringify(value)?.slice(0, 200)).toBe(false);
  return result.error?.issues.map((issue) => issue.path.join('.')) ?? [];
}

export function issueMessages(schema: z.ZodType, value: unknown): string[] {
  const result = schema.safeParse(value);
  expect(result.success).toBe(false);
  return result.error?.issues.map((issue) => issue.message) ?? [];
}

export function copyOf<Value>(value: Value): Value {
  return JSON.parse(JSON.stringify(value)) as Value;
}
