import { z } from 'zod/v4';
import { defineOpenuiComponent } from './define.ts';

// OpenUI's follow-up components (plan 06 §6.1, ADR 0124, 4, 11, 14): OpenUI's names, schemas, and descriptions.

export const followUpItem = defineOpenuiComponent(
  'FollowUpItem',
  z.object({ text: z.string() }),
  'Clickable follow-up suggestion — when clicked, sends text as user message',
);

export const followUpBlock = defineOpenuiComponent(
  'FollowUpBlock',
  z.object({ items: z.array(followUpItem.ref) }),
  'List of clickable follow-up suggestions placed at the end of a response',
);

export type FollowUpItemProps = z.infer<typeof followUpItem.props>;
export type FollowUpBlockProps = z.infer<typeof followUpBlock.props>;
