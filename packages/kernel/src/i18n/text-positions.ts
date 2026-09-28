import { textPropFormat, type Json, type JsonObject } from '@kvman/protocol';
import { objectOf } from '../validation/json-reading.ts';

function join(path: string, key: string | number): string {
  return path === '' ? String(key) : `${path}.${key}`;
}

// A local `$ref` (`#/$defs/<name>`, or `#` for the root) resolved against the document it belongs to.
function resolved(schema: JsonObject, root: JsonObject): JsonObject {
  const reference = schema['$ref'];
  if (typeof reference !== 'string' || !reference.startsWith('#')) return schema;
  const target = reference === '#' ? root : objectOf(objectOf(root['$defs'])?.[reference.slice('#/$defs/'.length)]);
  return target ?? schema;
}

function memberSchema(schema: JsonObject, key: string): JsonObject | undefined {
  const declared = objectOf(objectOf(schema['properties'])?.[key]);
  if (declared !== undefined) return declared;
  const pattern = Object.entries(objectOf(schema['patternProperties']) ?? {}).find(([source]) => new RegExp(source, 'u').test(key));
  return objectOf(pattern?.[1]) ?? objectOf(schema['additionalProperties']);
}

function visit(value: Json, given: JsonObject, root: JsonObject, path: string, found: Map<string, string>): void {
  const schema = resolved(given, root);
  if (schema['format'] === textPropFormat) {
    if (typeof value === 'string') found.set(path, value);
    return;
  }
  for (const keyword of ['anyOf', 'oneOf', 'allOf']) {
    const branches = schema[keyword];
    if (Array.isArray(branches)) for (const branch of branches) visit(value, objectOf(branch) ?? {}, root, path, found);
  }
  if (Array.isArray(value)) {
    const prefix = Array.isArray(schema['prefixItems']) ? schema['prefixItems'] : [];
    value.forEach((item, index) => {
      const itemSchema = objectOf(prefix[index]) ?? objectOf(schema['items']);
      if (itemSchema !== undefined) visit(item, itemSchema, root, join(path, index), found);
    });
    return;
  }
  const object = objectOf(value);
  if (object === undefined) return;
  for (const [key, member] of Object.entries(object)) {
    const memberAt = memberSchema(schema, key);
    if (memberAt !== undefined) visit(member, memberAt, root, join(path, key), found);
  }
}

// ADR 0160: the strings a JSON Schema marks as user-facing `Text` (format `kvman-text`) in a value it describes,
// each once by path. Where the value takes a union's other branch, the branch simply finds nothing.
export function textsIn(value: Json, schema: JsonObject, path: string, found: Map<string, string> = new Map()): Map<string, string> {
  visit(value, schema, schema, path, found);
  return found;
}
