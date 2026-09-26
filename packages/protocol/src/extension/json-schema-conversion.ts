import { z } from 'zod';
import { jsonObjectSchema, type JsonObject } from '../json.ts';

export type JsonSchemaConversion = { ok: true; document: JsonObject } | { ok: false; message: string };

// What senders send is recorded as its input view, so a defaulted field is optional at admission (ADR 0077).
export type SchemaView = 'input' | 'output';

function pipeMessage(path: readonly (string | number)[]): string {
  const at = path.length === 0 ? 'the schema itself' : path.join('.');
  return `a pipe, transform, preprocess, or codec at ${at} cannot be enforced by JSON Schema`;
}

// z.toJSONSchema throws for what JSON Schema cannot represent (transforms, custom types) and writes a pipe as one of
// its sides, silently; both are reported, at the registration's path, instead of failing the whole recording
// (06 §6.3: transforms, preprocess, and pipes fail).
export function toJsonSchemaDocument(schema: z.ZodType, view: SchemaView = 'output'): JsonSchemaConversion {
  const pipes: string[] = [];
  let converted: unknown;
  try {
    converted = z.toJSONSchema(schema, {
      io: view,
      override: (context) => {
        if (context.zodSchema instanceof z.ZodPipe) pipes.push(pipeMessage(context.path));
      },
    });
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
  const [pipe] = pipes;
  if (pipe !== undefined) return { ok: false, message: pipe };
  const document = jsonObjectSchema.safeParse(converted);
  return document.success ? { ok: true, document: document.data } : { ok: false, message: 'the schema does not convert to a JSON document' };
}
