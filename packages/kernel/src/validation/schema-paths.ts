import type { Json, JsonObject } from '@kvman/protocol';
import { objectOf } from './json-reading.ts';

export type PathLookup = { found: true } | { found: false; fields: string[] };

const constraining = ['type', 'properties', 'additionalProperties', 'items', 'anyOf', 'oneOf', 'allOf', '$ref', 'enum', 'const', 'not'];

function acceptsAnything(schema: Json): boolean {
  if (schema === true) return true;
  const object = objectOf(schema);
  return object !== undefined && constraining.every((keyword) => object[keyword] === undefined);
}

function resolveReference(root: JsonObject, reference: string): Json | undefined {
  if (reference === '#') return root;
  const name = reference.startsWith('#/$defs/') ? reference.slice('#/$defs/'.length) : undefined;
  return name === undefined ? undefined : objectOf(root['$defs'])?.[name];
}

function merge(lookups: PathLookup[]): PathLookup {
  if (lookups.some((lookup) => lookup.found)) return { found: true };
  return { found: false, fields: [...new Set(lookups.flatMap((lookup) => (lookup.found ? [] : lookup.fields)))] };
}

function branchesOf(object: JsonObject): Json[] {
  return ['anyOf', 'oneOf', 'allOf'].flatMap((keyword) => {
    const branches = object[keyword];
    return Array.isArray(branches) ? branches : [];
  });
}

// ADR 0109: a path exists when some reading of the schema declares it: `properties`, a `$ref` into `$defs`, any
// branch of a union or intersection, or an `additionalProperties` schema; a schema accepting anything takes the rest.
function lookup(root: JsonObject, schema: Json, segments: readonly string[], references: ReadonlySet<string>): PathLookup {
  if (segments.length === 0 || acceptsAnything(schema)) return { found: true };
  const object = objectOf(schema);
  if (object === undefined) return { found: false, fields: [] };
  const lookups: PathLookup[] = [];
  const reference = object['$ref'];
  if (typeof reference === 'string' && !references.has(reference)) {
    const target = resolveReference(root, reference);
    if (target !== undefined) lookups.push(lookup(root, target, segments, new Set([...references, reference])));
  }
  for (const branch of branchesOf(object)) lookups.push(lookup(root, branch, segments, references));
  const [key = '', ...rest] = segments;
  const properties = objectOf(object['properties']);
  const property = properties?.[key];
  const additional = object['additionalProperties'];
  if (property !== undefined) lookups.push(lookup(root, property, rest, new Set()));
  else if (additional !== undefined && additional !== false) lookups.push(lookup(root, additional, rest, new Set()));
  else lookups.push({ found: false, fields: Object.keys(properties ?? {}) });
  return merge(lookups);
}

export function lookupPath(schema: JsonObject, segments: readonly string[]): PathLookup {
  return lookup(schema, schema, segments, new Set());
}
