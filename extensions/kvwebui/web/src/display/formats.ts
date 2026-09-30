import type { Json } from '@kvman/sdk';
import type { Format } from '../contributions/views.ts';

// Column formats (plan 06 §6.4, ADR 0009, 75), in the UI language. `boolean` is drawn as a mark by the cell itself.

const byteUnits = ['B', 'KB', 'MB', 'GB'] as const;

function bytes(value: number, language: string): string {
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < byteUnits.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${new Intl.NumberFormat(language, { maximumFractionDigits: unit === 0 ? 0 : 1 }).format(size)} ${byteUnits[unit] ?? 'B'}`;
}

export const emptyMark = '—';

export function formatValue(value: Json | undefined, format: Format, language: string): string {
  if (value === undefined || value === null) return emptyMark;
  if (format === 'number' && typeof value === 'number') return new Intl.NumberFormat(language).format(value);
  if (format === 'bytes' && typeof value === 'number') return bytes(value, language);
  if (format === 'date' && typeof value === 'string' && !Number.isNaN(Date.parse(value))) {
    return new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

// A value's text for the table search.
export function searchText(value: Json | undefined): string {
  if (value === undefined || value === null) return '';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}
