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
  payload: z.record(z.string(), boundJsonSchema).optional(),
  refreshOn: z.array(typePatternSchema).optional(),
});
export type PageQuery = z.infer<typeof pageQuerySchema>;

export const pageQueriesSchema = z.record(z.string().regex(/^[A-Za-z][A-Za-z0-9_-]*$/, 'query aliases are plain names'), pageQuerySchema);

export const fieldOverrideSchema = z.strictObject({
  label: viewTextSchema.optional(),
  help: viewTextSchema.optional(),
  placeholder: viewTextSchema.optional(),
  order: z.number().optional(),
  group: viewTextSchema.optional(),
  widget: fieldWidgetSchema.optional(),
  options: z.array(z.tuple([boundJsonSchema, viewTextSchema])).optional(),
});

export const formOverrideFields = {
  title: viewTextSchema.optional(),
  submitLabel: viewTextSchema.optional(),
  defaults: z.record(z.string(), boundJsonSchema).optional(),
  hidden: z.array(z.string().min(1)).optional(),
  fields: z.record(z.string(), fieldOverrideSchema).optional(),
};

export const formOverridesSchema = z.strictObject(formOverrideFields);
export type FormOverrides = z.infer<typeof formOverridesSchema>;

export const columnSchema = z.strictObject({
  field: z.string().min(1).optional(),
  label: viewTextSchema,
  format: formatSchema.optional(),
  visibleIf: conditionSchema.optional(),
  sortable: z.boolean().optional(),
  as: z.union([z.enum(['text', 'badge', 'liveText', 'progress']), componentNameSchema]).optional(),
  live: boundStringSchema.optional(),
  width: z.enum(['auto', 'sm', 'md', 'lg']).optional(),
});
export type Column = z.infer<typeof columnSchema>;
