import { markReactive, tagSchemaId, type SubComponentOf } from '@openuidev/lang-core';
import { z } from 'zod/v4';

// OpenUI component definitions (plan 06 §6.1, ADR 0124, 4, 11): OpenUI's names, props schemas, and descriptions, from
// `@openuidev/react-ui` 0.18.5. The Vue component that draws each one is paired with its definition in `libraries.ts`.

/** A component's definition: its name, props schema, description, and the schema a parent uses to hold it. */
export type OpenuiComponentDefinition<Shape extends z.ZodRawShape = z.ZodRawShape> = {
  name: string;
  description: string;
  props: z.ZodObject<Shape>;
  ref: z.ZodType<SubComponentOf<z.infer<z.ZodObject<Shape>>>>;
};

/** Defines a component and tags its schema so prompt signatures name it. */
export function defineOpenuiComponent<Shape extends z.ZodRawShape>(name: string, props: z.ZodObject<Shape>, description: string): OpenuiComponentDefinition<Shape> {
  tagSchemaId(props, name);
  // At run time a component's `ref` is its props schema, as lang-core's `defineComponent` returns it; the type says
  // what a parent's prop holds once parsed: the child element, `{ type: 'element', props }`.
  const ref = props as unknown as z.ZodType<SubComponentOf<z.infer<z.ZodObject<Shape>>>>;
  return { name, description, props, ref };
}

/** A button's action: an `Action([…])` expression. */
export const actionSchema = z.any();
tagSchemaId(actionSchema, 'ActionExpression');

/** Marks a props schema as reactive, so a `$variable` binding reaches the renderer as a store reference. */
export function bound<Schema extends z.ZodType>(schema: Schema): Schema {
  markReactive(schema);
  return schema;
}
