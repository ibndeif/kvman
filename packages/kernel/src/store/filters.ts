import { z } from '@kvman/sdk';
import { findLimitMaximum } from '../limits.ts';
import { kernelProblem } from '../problems.ts';
import { validationFailed } from './json-values.ts';

// `find` and `count` filters: equality on top-level fields, combined with AND (plan 02 §2.5).

const filterSchema = z.record(z.string().min(1), z.union([z.string(), z.number(), z.boolean(), z.null()]));

const findOptionsSchema = z.strictObject({
  limit: z.number().int().positive().max(findLimitMaximum),
  order: z.enum(['asc', 'desc']).optional(),
});

export type SqlFilter = { sql: string; values: (string | number)[] };

function fieldPath(field: string): string {
  return `$."${field.replaceAll('"', '\\"')}"`;
}

function condition(field: string, value: string | number | boolean | null): SqlFilter {
  const path = fieldPath(field);
  if (value === null) return { sql: "json_type(data, ?) = 'null'", values: [path] };
  if (typeof value === 'boolean') return { sql: `json_type(data, ?) = '${value ? 'true' : 'false'}'`, values: [path] };
  if (typeof value === 'number') return { sql: "json_type(data, ?) IN ('integer', 'real') AND json_extract(data, ?) = ?", values: [path, path, value] };
  return { sql: "json_type(data, ?) = 'text' AND json_extract(data, ?) = ?", values: [path, path, value] };
}

export function filterSql(filter: unknown): SqlFilter {
  const parsed = filterSchema.safeParse(filter);
  if (!parsed.success) throw validationFailed('The filter', parsed.error);
  const conditions = Object.entries(parsed.data).map(([field, value]) => condition(field, value));
  if (conditions.length === 0) return { sql: '1', values: [] };
  return { sql: conditions.map((part) => `(${part.sql})`).join(' AND '), values: conditions.flatMap((part) => part.values) };
}

export function findOptions(options: unknown): { limit: number; order: 'asc' | 'desc' } {
  const parsed = findOptionsSchema.safeParse(options);
  if (!parsed.success) {
    throw kernelProblem('VALIDATION_FAILED', `find needs a whole-number limit of at most ${findLimitMaximum}.`, { limit: findLimitMaximum });
  }
  return { limit: parsed.data.limit, order: parsed.data.order ?? 'asc' };
}
