import { z } from 'zod/v4';
import { actionSchema, defineOpenuiComponent } from './define.ts';

// OpenUI's list components (plan 06 §6.1, ADR 0124, 4, 7, 11, 14): OpenUI's names, schemas, and descriptions.

// `left` and `right` are OpenUI's names for a row's label and value, not sides; quoted, so no one reads them as CSS.
const entityRow = z.object({ 'left': z.string(), 'right': z.string(), rightVariant: z.enum(['text', 'number']).default('text') });

export const entityList = defineOpenuiComponent(
  'EntityList',
  z
    .object({ rows: z.array(entityRow).default([]), size: z.enum(['small', 'default']).default('default'), header: entityRow.optional(), footer: entityRow.optional() })
    .refine(({ size, header, footer }) => size === 'default' || (header === undefined && footer === undefined), { message: 'EntityList size="small" does not support header or footer.', path: ['size'] }),
  "Two-column key/value rows (left label, right value). size 'default' supports optional header and footer rows; rightVariant 'number' uses tabular numbers.",
);

export const listItem = defineOpenuiComponent(
  'ListItem',
  z.object({
    title: z.string(),
    subtitle: z.string().optional(),
    image: z.object({ src: z.string(), alt: z.string() }).optional(),
    actionLabel: z.string().optional(),
    action: actionSchema.optional(),
  }),
  'Item in a ListBlock — displays a title with an optional subtitle and image. When action is provided, the item becomes clickable.',
);

export const listBlock = defineOpenuiComponent(
  'ListBlock',
  z.object({ items: z.array(listItem.ref), variant: z.enum(['number', 'image']).optional(), size: z.enum(['default', 'small']).optional() }),
  'A list of items with number or image indicators. Each item can optionally have an action. size small renders a compact list.',
);

export type EntityListProps = z.infer<typeof entityList.props>;
export type EntityRow = z.infer<typeof entityRow>;
export type ListBlockProps = z.infer<typeof listBlock.props>;
