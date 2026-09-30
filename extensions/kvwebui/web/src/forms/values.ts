import type { Json } from '@kvman/sdk';
import type { Field } from './fields.ts';

// What a form holds, and the input it sends (ADR 0009, 70). Values are keyed by field path; a checkbox holds a boolean
// and every other field its text. An empty field is left out, or sent as `null` when the field is nullable.

export type FormValues = Record<string, string | boolean>;

export type BuiltInput = { input: Record<string, Json>; invalid: string[] };

function leaves(fields: readonly Field[]): Field[] {
  return fields.flatMap((field) => (field.children === undefined ? [field] : leaves(field.children)));
}

export function emptyValues(fields: readonly Field[]): FormValues {
  return Object.fromEntries(leaves(fields).map((field) => [field.path, field.kind === 'checkbox' ? false : '']));
}

// A value's text in the field, for a setting's current value.
export function valueText(field: Field, value: Json | undefined): string | boolean {
  if (field.kind === 'checkbox') return value === true;
  if (value === undefined || value === null) return '';
  if (field.kind === 'select') return JSON.stringify(value);
  if (field.kind === 'lines' && Array.isArray(value)) return value.map(String).join('\n');
  if (field.kind === 'json') return JSON.stringify(value, null, 2);
  return String(value);
}

type Parsed = { value: Json } | { empty: true } | { invalid: true };

function parseText(field: Field, text: string): Parsed {
  const trimmed = text.trim();
  if (field.kind === 'lines') {
    const lines = text.split('\n').map((line) => line.trim()).filter((line) => line !== '');
    if (lines.length === 0) return field.required ? { value: [] } : { empty: true };
    const items = field.numbers === true ? lines.map(Number) : lines;
    return items.some((item) => typeof item === 'number' && Number.isNaN(item)) ? { invalid: true } : { value: items };
  }
  if (trimmed === '') return field.nullable ? { value: null } : { empty: true };
  if (field.kind === 'number') return Number.isNaN(Number(trimmed)) ? { invalid: true } : { value: Number(trimmed) };
  if (field.kind === 'select' || field.kind === 'json') {
    try {
      return { value: JSON.parse(trimmed) as Json };
    } catch {
      return { invalid: true };
    }
  }
  return { value: text };
}

function build(fields: readonly Field[], values: FormValues, invalid: string[]): Record<string, Json> {
  const input: Record<string, Json> = {};
  for (const field of fields) {
    if (field.children !== undefined) {
      const group = build(field.children, values, invalid);
      if (Object.keys(group).length > 0 || field.required) input[field.name] = group;
      continue;
    }
    const value = values[field.path];
    if (typeof value === 'boolean') {
      input[field.name] = value;
      continue;
    }
    const parsed = parseText(field, value ?? '');
    if ('invalid' in parsed) invalid.push(field.path);
    else if ('value' in parsed) input[field.name] = parsed.value;
  }
  return input;
}

export function buildInput(fields: readonly Field[], values: FormValues): BuiltInput {
  const invalid: string[] = [];
  return { input: build(fields, values, invalid), invalid };
}
