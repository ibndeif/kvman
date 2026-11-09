import { z } from 'zod/v4';
import { defineOpenuiComponent } from './define.ts';
import { contentChildUnion } from './unions.ts';

// OpenUI's layout components (plan 06 §6.1, ADR 0124, 4, 11): OpenUI's names, schemas, and descriptions.

/** The flex props every container shares. */
export const flexPropsShape = {
  direction: z.enum(['row', 'column']).optional(),
  gap: z.enum(['none', 'xs', 's', 'm', 'l', 'xl', '2xl']).optional(),
  align: z.enum(['start', 'center', 'end', 'stretch', 'baseline']).optional(),
  justify: z.enum(['start', 'center', 'end', 'between', 'around', 'evenly']).optional(),
  wrap: z.boolean().optional(),
};

export const stack = defineOpenuiComponent(
  'Stack',
  z.object({ children: z.array(z.any()), ...flexPropsShape }),
  'Flex container. direction: "row"|"column" (default "column"). gap: "none"|"xs"|"s"|"m"|"l"|"xl"|"2xl" (default "m"). align: "start"|"center"|"end"|"stretch"|"baseline". justify: "start"|"center"|"end"|"between"|"around"|"evenly".',
);

export const tabItem = defineOpenuiComponent(
  'TabItem',
  z.object({ value: z.string(), trigger: z.string(), content: z.array(contentChildUnion) }),
  'value is unique id, trigger is tab label, content is array of components',
);

export const tabs = defineOpenuiComponent('Tabs', z.object({ items: z.array(tabItem.ref) }), 'Tabbed container');

export const accordionItem = defineOpenuiComponent(
  'AccordionItem',
  z.object({ value: z.string(), trigger: z.string(), content: z.array(contentChildUnion) }),
  'value is unique id, trigger is section title',
);

export const accordion = defineOpenuiComponent('Accordion', z.object({ items: z.array(accordionItem.ref) }), 'Collapsible sections');

export type StackProps = z.infer<typeof stack.props>;
export type TabsProps = z.infer<typeof tabs.props>;
export type TabItemProps = z.infer<typeof tabItem.props>;
export type AccordionProps = z.infer<typeof accordion.props>;
export type AccordionItemProps = z.infer<typeof accordionItem.props>;
