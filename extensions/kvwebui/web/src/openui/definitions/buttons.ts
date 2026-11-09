import { z } from 'zod/v4';
import { icon } from './data-display.ts';
import { actionSchema, defineOpenuiComponent } from './define.ts';

// OpenUI's button components (plan 06 §6.1, ADR 0124, 4, 11): OpenUI's names, schemas, and descriptions.

export const button = defineOpenuiComponent(
  'Button',
  z.object({
    label: z.string(),
    action: actionSchema.optional(),
    variant: z.enum(['primary', 'secondary', 'tertiary']).optional(),
    type: z.enum(['normal', 'destructive']).optional(),
    size: z.enum(['extra-small', 'small', 'medium', 'large']).optional(),
  }),
  'Clickable button',
);

export const buttons = defineOpenuiComponent(
  'Buttons',
  z.object({ buttons: z.array(button.props), direction: z.enum(['row', 'column']).optional() }),
  'Group of Button components. direction: "row" (default) | "column".',
);

export const iconButton = defineOpenuiComponent(
  'IconButton',
  z.object({
    name: z.string(),
    icon: icon.ref,
    action: actionSchema.optional(),
    variant: z.enum(['primary', 'secondary', 'tertiary']).optional(),
    size: z.enum(['extra-small', 'small', 'medium', 'large']).optional(),
    shape: z.enum(['square', 'circle']).optional(),
  }),
  'Icon-only button. name is the accessible label and the action label; icon is an Icon; action fires on click.',
);

export type ButtonProps = z.infer<typeof button.props>;
export type ButtonsProps = z.infer<typeof buttons.props>;
export type IconButtonProps = z.infer<typeof iconButton.props>;
