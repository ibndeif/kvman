import { toJsonSchemaDocument, type JsonObject, type SchemaView } from '@kvman/protocol';

// A kernel type's schema as the registry holds it; kernel schemas always convert.
export function jsonDocument(schema: Parameters<typeof toJsonSchemaDocument>[0], view: SchemaView): JsonObject {
  const conversion = toJsonSchemaDocument(schema, view);
  if (!conversion.ok) throw new Error(`a kernel schema does not convert to JSON Schema: ${conversion.message}`);
  return conversion.document;
}
