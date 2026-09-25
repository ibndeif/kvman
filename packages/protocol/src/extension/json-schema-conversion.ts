import { z } from 'zod';
import { jsonObjectSchema, type JsonObject } from '../json.ts';

export type JsonSchemaConversion = { ok: true; document: JsonObject } | { ok: false; message: string };

// What senders send is recorded as its input view, so a defaulted field is optional at admission (ADR 0077).
export type SchemaView = 'input' | 'output';

// z.toJSONSchema throws for what JSON Schema cannot represent (transforms, custom types); the recorder reports that
// as an issue at the registration's path instead of failing the whole recording.
export function toJsonSchemaDocument(schema: z.ZodType, view: SchemaView = 'output'): JsonSchemaConversion {
  let converted: unknown;
  try {
    converted = z.toJSONSchema(schema, { io: view });
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
  const document = jsonObjectSchema.safeParse(converted);
  return document.success ? { ok: true, document: document.data } : { ok: false, message: 'the schema does not convert to a JSON document' };
}
