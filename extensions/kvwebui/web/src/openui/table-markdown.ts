import type { EditableColumn } from './definitions/tables.ts';

// An edited table as its save sends it (plan 06 §6.1, ADR 0124, 14): a Markdown table of the columns' headers and one
// row per data row, a select cell as its option's label, every `|` escaped and every line break a space.

export type EditableRow = { id: string; values: (string | number)[] };

const escaped = (text: string): string => text.replaceAll('|', '\\|').replace(/\s*\r?\n\s*/g, ' ');

function cell(value: string | number | undefined, column: EditableColumn): string {
  const text = String(value ?? '');
  if (column.type !== 'select') return escaped(text);
  return escaped(column.options?.find((option) => option.value === text)?.label ?? text);
}

/** The lines of the Markdown table. */
export function markdownTable(columns: readonly EditableColumn[], rows: readonly EditableRow[]): string[] {
  return [
    `| ${columns.map((column) => escaped(column.header)).join(' | ')} |`,
    `| ${columns.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${columns.map((column, index) => cell(row.values[index], column)).join(' | ')} |`),
  ];
}
