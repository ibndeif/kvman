import { z } from 'zod';
import { textSchema } from '../text.ts';

export const fieldWidgetSchema = z.enum(['text', 'textarea', 'number', 'select', 'checkbox', 'switch', 'date', 'secret', 'upload']);

export const configFieldMetaSchema = z.strictObject({
  label: textSchema.optional(),
  help: textSchema.optional(),
  secret: z.boolean().optional(),
  ui: z.strictObject({ widget: fieldWidgetSchema.optional(), group: textSchema.optional(), order: z.number().optional() }).optional(),
});
export type ConfigFieldMeta = z.infer<typeof configFieldMetaSchema>;

export const configScopeSchema = z.enum(['global', 'workspace', 'both']);
