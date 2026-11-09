import { z } from 'zod/v4';
import { defineOpenuiComponent } from './define.ts';
import { chatNestedContentUnion } from './unions.ts';

// The chat library's containers (plan 06 §6.1, ADR 0124, 4): OpenUI gives Tabs, Accordion, and the section block wider
// content unions under the same names, so a reply's containers can hold follow-ups and one another. The renderers are
// shared with the full library's containers.

export const chatAccordionItem = defineOpenuiComponent(
  'AccordionItem',
  z.object({ value: z.string(), trigger: z.string(), content: z.array(chatNestedContentUnion) }),
  'value is unique id, trigger is section title',
);

export const chatAccordion = defineOpenuiComponent('Accordion', z.object({ items: z.array(chatAccordionItem.ref) }), 'Collapsible sections');

export const chatTabItem = defineOpenuiComponent(
  'TabItem',
  z.object({
    value: z.string(),
    trigger: z.string(),
    content: z.array(z.union([...chatNestedContentUnion.options, chatAccordion.ref])),
  }),
  'value is unique id, trigger is tab label, content is array of components',
);

export const chatTabs = defineOpenuiComponent('Tabs', z.object({ items: z.array(chatTabItem.ref) }), 'Tabbed container');

export const chatCarousel = defineOpenuiComponent(
  'Carousel',
  z.object({ children: z.array(z.array(chatNestedContentUnion)), variant: z.enum(['card', 'sunk']).optional() }),
  'Horizontal scrollable carousel',
);

export const chatSectionItem = defineOpenuiComponent(
  'SectionItem',
  z.object({
    value: z.string(),
    trigger: z.string(),
    content: z.array(z.union([...chatNestedContentUnion.options, chatTabs.ref, chatAccordion.ref])),
  }),
  'Section with a label and collapsible content — used inside SectionBlock',
);

export const chatSectionBlock = defineOpenuiComponent(
  'SectionBlock',
  z.object({ sections: z.array(chatSectionItem.ref), isFoldable: z.boolean().optional() }),
  'Collapsible accordion sections. Auto-opens sections as they stream in. Use SectionItem for each section.',
);

export const chatContentChildUnion = z.union([...chatNestedContentUnion.options, chatSectionBlock.props]);

export type ChatAccordionItemProps = z.infer<typeof chatAccordionItem.props>;
export type ChatAccordionProps = z.infer<typeof chatAccordion.props>;
export type ChatTabItemProps = z.infer<typeof chatTabItem.props>;
export type ChatTabsProps = z.infer<typeof chatTabs.props>;
export type ChatSectionItemProps = z.infer<typeof chatSectionItem.props>;
export type ChatSectionBlockProps = z.infer<typeof chatSectionBlock.props>;
