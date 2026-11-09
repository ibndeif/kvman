import { z } from 'zod/v4';
import { chatSectionBlock, chatTabs } from './chat-containers.ts';
import { defineOpenuiComponent } from './define.ts';
import { flexPropsShape, stack, tabs } from './layout.ts';
import { chatNestedContentUnion, contentChildUnion } from './unions.ts';

// OpenUI's Card, in both libraries (plan 06 §6.1, ADR 0124, 4, 11): `openuiLibrary`'s Card takes Stack children and
// flex props; the chat library's Card is a vertical container with an optional Sources strip.

export const cardSourceSchema = z.object({ url: z.string().optional(), title: z.string(), sourceName: z.string() });

export type CardSource = z.infer<typeof cardSourceSchema>;

/** OpenUI's card children: the content union, then Tabs and Stack. */
const cardChildUnion = z.union([...contentChildUnion.options, tabs.props, stack.props]);

export const card = defineOpenuiComponent(
  'Card',
  z.object({ children: z.array(cardChildUnion), variant: z.enum(['card', 'sunk', 'clear']).optional(), ...flexPropsShape }),
  'Styled container. variant: "card" (default, elevated) | "sunk" (recessed) | "clear" (transparent). Always full width. Accepts all Stack flex params (default: direction "column"). Cards flex to share space in row/wrap layouts.',
);

export const chatCard = defineOpenuiComponent(
  'Card',
  z.object({
    children: z.array(z.union([...chatNestedContentUnion.options, chatSectionBlock.props, chatTabs.props])),
    sources: z.array(cardSourceSchema).optional(),
  }),
  'Vertical container for all content in a chat response. Children stack top to bottom automatically. Optional sources ([{ title, sourceName, url }]) render as a Sources strip at the bottom and back inline [n] citations in TextContent.',
);

export type CardProps = z.infer<typeof card.props>;
export type ChatCardProps = z.infer<typeof chatCard.props>;
