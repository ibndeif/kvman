import { z } from 'zod';
import { jsonObjectSchema, type JsonObject } from '../json.ts';

export type JsonSchemaConversion = { ok: true; document: JsonObject } | { ok: false; message: string };

// z.toJSONSchema throws for what JSON Schema cannot represent (transforms, custom types); the recorder reports that
// as an issue at the registration's path instead of failing the whole recording.
export function toJsonSchemaDocument(schema: z.ZodType): JsonSchemaConversion {
  let converted: unknown;
  try {
    converted = z.toJSONSchema(schema);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
  const document = jsonObjectSchema.safeParse(converted);
  return document.success ? { ok: true, document: document.data } : { ok: false, message: 'the schema does not convert to a JSON document' };
}
