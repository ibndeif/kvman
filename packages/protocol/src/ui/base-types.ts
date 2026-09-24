import { z } from 'zod';
import { fieldWidgetSchema } from '../extension/config-meta.ts';
import { publicNameSchema } from '../extension/grammar.ts';
import { typeNameSchema, typePatternSchema } from '../identifiers.ts';
import { boundJsonSchema, boundStringSchema, viewTextSchema } from './bound-values.ts';
import { conditionSchema } from './condition.ts';

export const toneSchema = z.enum(['neutral', 'info', 'success', 'warning', 'danger']);
export type Tone = z.infer<typeof toneSchema>;

export const levelSchema = z.enum(['info', 'success', 'warning', 'error']);
export type Level = z.infer<typeof levelSchema>;

export const formatSchema = z.union([
  z.enum(['date', 'time', 'dateTime', 'relative', 'number', 'integer', 'percent', 'bytes', 'duration']),
  z.templateLiteral(['currency:', z.string().regex(/^[A-Za-z]{3}$/)]),
]);
export type Format = z.infer<typeof formatSchema>;

export const builtinComponentNamePattern = /^[a-z][a-zA-Z0-9]*$/;

export const componentNameSchema = z.union([z.string().regex(builtinComponentNamePattern), publicNameSchema]);

export const pageQuerySchema = z.strictObject({
  query: typeNameSchema,
  payload: z.record(z.string(), boundJsonSchema).exactOptional(),
  refreshOn: z.array(typePatternSchema).exactOptional(),
});
export type PageQuery = z.infer<typeof pageQuerySchema>;

export const pageQueriesSchema = z.record(z.string().regex(/^[A-Za-z][A-Za-z0-9_-]*$/, 'query aliases are plain names'), pageQuerySchema);

export const fieldOverrideSchema = z.strictObject({
  label: viewTextSchema.exactOptional(),
  help: viewTextSchema.exactOptional(),
  placeholder: viewTextSchema.exactOptional(),
  order: z.number().exactOptional(),
  group: viewTextSchema.exactOptional(),
  widget: fieldWidgetSchema.exactOptional(),
  options: z.array(z.tuple([boundJsonSchema, viewTextSchema])).exactOptional(),
});

export const formOverrideFields = {
  title: viewTextSchema.exactOptional(),
  submitLabel: viewTextSchema.exactOptional(),
  defaults: z.record(z.string(), boundJsonSchema).exactOptional(),
  hidden: z.array(z.string().min(1)).exactOptional(),
  fields: z.record(z.string(), fieldOverrideSchema).exactOptional(),
};

export const formOverridesSchema = z.strictObject(formOverrideFields);
export type FormOverrides = z.infer<typeof formOverridesSchema>;

export const columnSchema = z.strictObject({
  field: z.string().min(1).exactOptional(),
  label: viewTextSchema,
  format: formatSchema.exactOptional(),
  visibleIf: conditionSchema.exactOptional(),
  sortable: z.boolean().exactOptional(),
  as: z.union([z.enum(['text', 'badge', 'liveText', 'progress']), componentNameSchema]).exactOptional(),
  live: boundStringSchema.exactOptional(),
  width: z.enum(['auto', 'sm', 'md', 'lg']).exactOptional(),
});
export type Column = z.infer<typeof columnSchema>;
