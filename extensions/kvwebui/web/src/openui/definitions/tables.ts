import { z } from 'zod/v4';
import { defineOpenuiComponent } from './define.ts';

// OpenUI's table components (plan 06 §6.1, ADR 0124, 4, 11, 14): OpenUI's names, schemas, and descriptions.

export const col = defineOpenuiComponent(
  'Col',
  z.object({ label: z.string(), data: z.any(), type: z.enum(['string', 'number', 'action']).optional() }),
  'Column definition — holds label + data array',
);

export const table = defineOpenuiComponent('Table', z.object({ columns: z.array(col.ref) }), 'Data table — column-oriented. Each Col holds its own data array.');

export const editableTable = defineOpenuiComponent(
  'EditableTable',
  z.object({
    name: z.string().default(''),
    columns: z
      .array(
        z.object({
          type: z.enum(['text', 'number', 'date-single', 'select', 'url']),
          key: z.string().default('default'),
          header: z.string().default(''),
          width: z.number().optional(),
          options: z.array(z.object({ value: z.string(), label: z.string() })).optional(),
        }),
      )
      .default([]),
    data: z.array(z.object({ id: z.string(), values: z.array(z.union([z.string(), z.number()])) })).default([]),
  }),
  'Spreadsheet-like table whose cells the user can edit inline (text, number, url, date, select columns); edits are saved back as a form field',
);

export type ColProps = z.infer<typeof col.props>;
export type TableProps = z.infer<typeof table.props>;
export type EditableTableProps = z.infer<typeof editableTable.props>;
export type EditableColumn = EditableTableProps['columns'][number];
