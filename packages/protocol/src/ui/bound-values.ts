import { z } from 'zod';
import type { Json } from '../json.ts';
import { bindingProblems, isBindingText } from './binding.ts';
import { textPropFormat } from './prop-formats.ts';

export const boundStringSchema = z.string().superRefine((text, check) => {
  for (const message of bindingProblems(text)) check.addIssue({ code: 'custom', message });
});

export const bindingSchema = boundStringSchema.refine(isBindingText, 'expected a binding such as "$item.name"');

export const boundJsonSchema: z.ZodType<Json> = z.lazy(() =>
  z.union([z.null(), z.boolean(), z.number(), boundStringSchema, z.array(boundJsonSchema), z.record(z.string(), boundJsonSchema)]),
);

export const viewTextSchema = z.union([boundStringSchema, z.object({ $t: z.string().min(1) }).catchall(boundJsonSchema)]).meta({
  format: textPropFormat,
});
