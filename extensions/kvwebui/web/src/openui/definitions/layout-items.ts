import { z } from 'zod/v4';
import { defineOpenuiComponent } from './define.ts';

// OpenUI's step and separator components (plan 06 §6.1, ADR 0124, 4, 11): OpenUI's names, schemas, and descriptions.
// They live beside `layout.ts` because the content union holds them and `layout.ts` holds the tabs and accordion that
// hold the content union, so keeping them in one file would close an import circle.

export const stepsItem = defineOpenuiComponent('StepsItem', z.object({ title: z.string(), details: z.string() }), 'title and details text for one step');

export const steps = defineOpenuiComponent('Steps', z.object({ items: z.array(stepsItem.ref) }), 'Step-by-step guide');

export const separator = defineOpenuiComponent(
  'Separator',
  z.object({ orientation: z.enum(['horizontal', 'vertical']).optional(), decorative: z.boolean().optional() }),
  'Visual divider between content sections',
);

export type StepsItemProps = z.infer<typeof stepsItem.props>;
export type StepsProps = z.infer<typeof steps.props>;
export type SeparatorProps = z.infer<typeof separator.props>;
