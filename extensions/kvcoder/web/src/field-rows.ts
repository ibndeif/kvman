// A payload or an output as rows of name and value (ADR 0036, 9), so nothing shows as escaped JSON: a string of
// several lines is a text block, an array of flat objects a table, an array of scalars one item per line.

export type FieldValue =
  | { kind: 'text'; text: string }
  | { kind: 'empty' }
  | { kind: 'block'; text: string }
  | { kind: 'table'; columns: string[]; rows: string[][] }
  | { kind: 'items'; items: string[] }
  | { kind: 'rows'; rows: FieldRow[] };

export type FieldRow = { name: string; value: FieldValue };

type Scalar = string | number | boolean | null;

const dash = '—';

const isScalar = (value: unknown): value is Scalar => value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';

const scalarText = (value: Scalar): string => (value === null ? dash : String(value));

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : undefined;
}

function flatRecord(value: unknown): Record<string, Scalar> | undefined {
  const found = record(value);
  if (found === undefined) return undefined;
  const flat: Record<string, Scalar> = {};
  for (const [name, field] of Object.entries(found)) {
    if (!isScalar(field)) return undefined;
    flat[name] = field;
  }
  return flat;
}

function table(items: readonly Record<string, Scalar>[]): FieldValue {
  const columns = [...new Set(items.flatMap((item) => Object.keys(item)))];
  return { kind: 'table', columns, rows: items.map((item) => columns.map((column) => (column in item ? scalarText(item[column] ?? null) : ''))) };
}

function arrayValue(items: readonly unknown[]): FieldValue {
  if (items.length === 0) return { kind: 'empty' };
  if (items.every(isScalar)) return { kind: 'items', items: items.map(scalarText) };
  const flat = items.map(flatRecord).filter((item) => item !== undefined);
  if (flat.length === items.length) return table(flat);
  return { kind: 'rows', rows: items.map((item, index) => ({ name: String(index + 1), value: fieldValue(item) })) };
}

export function fieldValue(value: unknown): FieldValue {
  if (typeof value === 'string') return value.includes('\n') ? { kind: 'block', text: value } : { kind: 'text', text: value };
  if (typeof value === 'number' || typeof value === 'boolean') return { kind: 'text', text: String(value) };
  if (Array.isArray(value)) return arrayValue(value);
  const found = record(value);
  return found === undefined || Object.keys(found).length === 0 ? { kind: 'empty' } : { kind: 'rows', rows: fieldRows(found) };
}

/** An object's fields as rows, in the object's order. */
export function fieldRows(fields: Record<string, unknown>): FieldRow[] {
  return Object.entries(fields).map(([name, value]) => ({ name, value: fieldValue(value) }));
}
