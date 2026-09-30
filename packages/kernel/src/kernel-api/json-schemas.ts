import { jsonSchemaDocumentSchema, z, type Json } from '@kvman/sdk';

// A zod schema as JSON Schema, for forms (ADR 0009, 23): inputs and settings in zod's `input` mode, outputs in its
// `output` mode; a part JSON Schema can't express becomes `{}`.
export function jsonSchemaOf(schema: z.ZodType, io: 'input' | 'output'): Record<string, Json> {
  return jsonSchemaDocumentSchema.parse(z.toJSONSchema(schema, { io, unrepresentable: 'any' }));
}
