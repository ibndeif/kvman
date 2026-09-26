import type { Issue, Json, JsonObject } from '@kvman/protocol';
import { objectOf, stringAt } from './json-reading.ts';

// A nullable field keeps its description on the non-null branch (`anyOf: [{ …, description }, { type: 'null' }]`).
function described(field: Json): boolean {
  if (/\S/.test(stringAt(field, 'description') ?? '')) return true;
  const branches = objectOf(field)?.['anyOf'];
  return Array.isArray(branches) && branches.some((branch) => /\S/.test(stringAt(branch, 'description') ?? ''));
}

function fieldIssues(schema: JsonObject, path: string): Issue[] {
  const properties = Object.entries(objectOf(schema['properties']) ?? {}).flatMap(([name, field]) => {
    const fieldPath = `${path}.properties.${name}`;
    const own = described(field) ? [] : [{ path: fieldPath, message: `the config field "${name}" has no description`, hint: `add .describe('…') to the field "${name}"` }];
    const nested = objectOf(field);
    return [...own, ...(nested === undefined ? [] : fieldIssues(nested, fieldPath))];
  });
  const items = objectOf(schema['items']);
  const branches = ['anyOf', 'oneOf', 'allOf'].flatMap((keyword) => {
    const list = schema[keyword];
    return Array.isArray(list) ? list.flatMap((branch, index) => {
      const object = objectOf(branch);
      return object === undefined ? [] : fieldIssues(object, `${path}.${keyword}.${index}`);
    }) : [];
  });
  return [...properties, ...(items === undefined ? [] : fieldIssues(items, `${path}.items`)), ...branches];
}

// 00 rule 5, ADR 0106: every config field is documented, at every depth; other schemas' fields are not checked.
export function configIssues(manifest: JsonObject): Issue[] {
  const schema = objectOf(objectOf(manifest['config'])?.['schema']);
  return schema === undefined ? [] : fieldIssues(schema, 'config.schema');
}
