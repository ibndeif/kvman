import { z } from '@kvman/sdk';
import { findLimitMaximum } from '../limits.ts';
import { kernelProblem } from '../problems.ts';
import { typeOf, valueOf } from './indexes.ts';
import { validationFailed } from './json-values.ts';

// `find` and `count` filters: equality on top-level fields, combined with AND (plan 02 §2.5).

const filterSchema = z.record(z.string().min(1), z.union([z.string(), z.number(), z.boolean(), z.null()]));

const findOptionsSchema = z.strictObject({
  limit: z.number().int().positive().max(findLimitMaximum),
  order: z.enum(['asc', 'desc']).optional(),
  after: z.string().min(1).optional(),
});

export type SqlFilter = { sql: string; values: (string | number)[]; fields: string[] };

// Each field's type and value are spelled as its declared index spells them, so SQLite can match them (ADR 0088, 3).
function condition(field: string, value: string | number | boolean | null): Omit<SqlFilter, 'fields'> {
  if (value === null) return { sql: `${typeOf(field)} = 'null'`, values: [] };
  if (typeof value === 'boolean') return { sql: `${typeOf(field)} = '${value ? 'true' : 'false'}'`, values: [] };
  if (typeof value === 'number') return { sql: `${typeOf(field)} IN ('integer', 'real') AND ${valueOf(field)} = ?`, values: [value] };
  return { sql: `${typeOf(field)} = 'text' AND ${valueOf(field)} = ?`, values: [value] };
}

export function filterSql(filter: unknown): SqlFilter {
  const parsed = filterSchema.safeParse(filter);
  if (!parsed.success) throw validationFailed('The filter', parsed.error);
  const fields = Object.keys(parsed.data);
  const conditions = Object.entries(parsed.data).map(([field, value]) => condition(field, value));
  if (conditions.length === 0) return { sql: '1', values: [], fields };
  return { sql: conditions.map((part) => `(${part.sql})`).join(' AND '), values: conditions.flatMap((part) => part.values), fields };
}

export function findOptions(options: unknown): { limit: number; order: 'asc' | 'desc'; after?: string } {
  const parsed = findOptionsSchema.safeParse(options);
  if (!parsed.success) {
    throw kernelProblem('VALIDATION_FAILED', `find needs a whole-number limit of at most ${findLimitMaximum}, an optional asc/desc order, and a non-empty after ID when supplied.`, { limit: findLimitMaximum });
  }
  return { limit: parsed.data.limit, order: parsed.data.order ?? 'asc', ...(parsed.data.after === undefined ? {} : { after: parsed.data.after }) };
}
