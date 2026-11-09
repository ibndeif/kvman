import { z } from 'zod/v4';
import { bound, defineOpenuiComponent } from './define.ts';
import { contentChildUnion } from './unions.ts';

// OpenUI's Modal and Carousel (plan 06 §6.1, ADR 0124, 4, 11, 16): OpenUI's names, schemas, and descriptions. They
// hold the content union, so they live apart from the components it holds.

export const modal = defineOpenuiComponent(
  'Modal',
  z.object({ title: z.string(), open: bound(z.boolean().optional()), children: z.array(contentChildUnion), size: z.enum(['sm', 'md', 'lg']).optional() }),
  'Modal dialog. open is a reactive $boolean binding — set to true to open, X/Escape/backdrop auto-closes. Put Form with buttons inside children.',
);

export const carousel = defineOpenuiComponent(
  'Carousel',
  z.object({ children: z.array(z.array(contentChildUnion)), variant: z.enum(['card', 'sunk']).optional() }),
  'Horizontal scrollable carousel',
);

export type ModalProps = z.infer<typeof modal.props>;
export type CarouselProps = z.infer<typeof carousel.props>;
