import { z } from 'zod';
import { actionSchema, effectSchema } from './action.ts';
import { boundJsonSchema, viewTextSchema } from './bound-values.ts';
import { conditionSchema } from './condition.ts';
import type { ViewNode } from './view-node.ts';
import { viewNodeSchema } from './view-node.ts';

export type ComponentEvent = { description: string; value?: z.ZodType };

export type ComponentSpec = {
  name: string;
  description: string;
  since: string;
  props: z.ZodType;
  events: Record<string, ComponentEvent>;
  children: 'none' | 'any' | readonly string[];
  parents?: readonly string[];
  childCount?: { min?: number; max?: number };
  examples: ViewNode[];
};

export const shellVersionOfLibrary = '2.0.0';

export const eventProp = z.lazy(() => actionSchema);
export const effectsProp = z.lazy(() => z.array(effectSchema));
export const nestedViewProp = z.lazy(() => viewNodeSchema);

const commonNodeShape = { id: z.string().min(1).optional(), visibleIf: conditionSchema.optional() };

export function nodeProps<Shape extends z.ZodRawShape>(shape: Shape) {
  return z.strictObject({ ...commonNodeShape, ...shape });
}

export function pressableProps<Shape extends z.ZodRawShape>(shape: Shape) {
  return nodeProps({ disabledIf: conditionSchema.optional(), ...shape });
}

export function inputControlProps<Shape extends z.ZodRawShape>(shape: Shape) {
  return pressableProps({
    label: viewTextSchema.optional(),
    help: viewTextSchema.optional(),
    required: z.boolean().optional(),
    value: boundJsonSchema.optional(),
    ...shape,
  });
}
