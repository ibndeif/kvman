import { jsonSchemaDocumentSchema, z, type Json } from '@kvman/sdk';

type Converted = { input?: Record<string, Json>; output?: Record<string, Json> };

// A registration's schemas never change once its extension has loaded, and `kernel.extensions.list` and
// `kernel.settings.list` describe every one of them on each call, so a conversion is kept with its schema.
const converted = new WeakMap<z.ZodType, Converted>();

// A zod schema as JSON Schema, for forms (ADR 0009, 23): inputs and settings in zod's `input` mode, outputs in its
// `output` mode; a part JSON Schema can't express becomes `{}`.
export function jsonSchemaOf(schema: z.ZodType, io: 'input' | 'output'): Record<string, Json> {
  const known = converted.get(schema) ?? {};
  const found = known[io];
  if (found !== undefined) return found;
  const document = jsonSchemaDocumentSchema.parse(z.toJSONSchema(schema, { io, unrepresentable: 'any' }));
  converted.set(schema, { ...known, [io]: document });
  return document;
}
