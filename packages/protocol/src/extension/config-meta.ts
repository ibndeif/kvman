import { z } from 'zod';
import { textSchema } from '../text.ts';

export const fieldWidgetSchema = z.enum(['text', 'textarea', 'number', 'select', 'checkbox', 'switch', 'date', 'secret', 'upload']);

export const configFieldMetaSchema = z.strictObject({
  label: textSchema.exactOptional(),
  help: textSchema.exactOptional(),
  secret: z.boolean().exactOptional(),
  ui: z.strictObject({ widget: fieldWidgetSchema.exactOptional(), group: textSchema.exactOptional(), order: z.number().exactOptional() }).exactOptional(),
});
export type ConfigFieldMeta = z.infer<typeof configFieldMetaSchema>;

export const configScopeSchema = z.enum(['global', 'workspace', 'both']);
