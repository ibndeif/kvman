import { blobIdFormat, type Json, type JsonObject } from '@kvman/protocol';

function isObject(value: Json | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function schemaAt(root: JsonObject, reference: string): JsonObject | undefined {
  if (reference === '#') return root;
  const match = /^#\/(\$defs|definitions)\/([^/]+)$/.exec(reference);
  if (match === null) return undefined;
  const definitions = root[match[1] ?? ''];
  const found = isObject(definitions) ? definitions[match[2] ?? ''] : undefined;
  return isObject(found) ? found : undefined;
}

type Walk = { root: JsonObject; found: Set<string> };

function childSchemas(node: JsonObject, key: string): JsonObject[] {
  const properties = node['properties'];
  const named = isObject(properties) ? properties[key] : undefined;
  if (isObject(named)) return [named];
  const patterns = node['patternProperties'];
  const matching = isObject(patterns)
    ? Object.entries(patterns).flatMap(([pattern, schema]) => (isObject(schema) && new RegExp(pattern, 'u').test(key) ? [schema] : []))
    : [];
  const additional = node['additionalProperties'];
  return matching.length > 0 ? matching : isObject(additional) ? [additional] : [];
}

function itemSchema(node: JsonObject, index: number): JsonObject | undefined {
  const prefix = node['prefixItems'];
  const positional = Array.isArray(prefix) ? prefix[index] : undefined;
  if (isObject(positional)) return positional;
  const items = node['items'];
  return isObject(items) ? items : undefined;
}

// `seen` holds the schemas already applied to this value, so references and unions that loop without descending end.
function visit(walk: Walk, node: JsonObject, value: Json, seen: Set<JsonObject>): void {
  if (seen.has(node)) return;
  seen.add(node);
  if (node['format'] === blobIdFormat && typeof value === 'string') walk.found.add(value);
  const reference = node['$ref'];
  const target = typeof reference === 'string' ? schemaAt(walk.root, reference) : undefined;
  if (target !== undefined) visit(walk, target, value, seen);
  for (const keyword of ['anyOf', 'oneOf', 'allOf']) {
    const branches = node[keyword];
    if (Array.isArray(branches)) for (const branch of branches) if (isObject(branch)) visit(walk, branch, value, seen);
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      const schema = itemSchema(node, index);
      if (schema !== undefined) visit(walk, schema, item, new Set());
    });
  } else if (isObject(value)) {
    for (const [key, child] of Object.entries(value)) for (const schema of childSchemas(node, key)) visit(walk, schema, child, new Set());
  }
}

// 04 §4.6, ADR 0134: the blob IDs a value carries in `z.blobId()` fields of its schema. A union position is read
// through every branch that has a blob field there, so the admission check refuses more rather than less, and a
// receiver is granted only IDs its sender was checked for.
export function blobIdsIn(schema: JsonObject | undefined, value: Json): string[] {
  if (schema === undefined) return [];
  const walk: Walk = { root: schema, found: new Set() };
  visit(walk, schema, value, new Set());
  return [...walk.found];
}
