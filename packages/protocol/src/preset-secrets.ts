import type { Json, JsonObject } from './json.ts';
import type { Preset } from './preset.ts';
import type { Issue } from './problem.ts';

function asObject(value: Json | undefined): JsonObject | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
}

function secretPaths(value: Json, schema: JsonObject, path: string): string[] {
  if (schema['secret'] === true) return [path];
  const properties = asObject(schema['properties']);
  const items = asObject(schema['items']);
  if (Array.isArray(value)) {
    return items === undefined ? [] : value.flatMap((item, index) => secretPaths(item, items, `${path}.${index}`));
  }
  const fields = asObject(value);
  if (fields === undefined || properties === undefined) return [];
  return Object.entries(fields).flatMap(([name, field]) => {
    const fieldSchema = asObject(properties[name]);
    return fieldSchema === undefined ? [] : secretPaths(field, fieldSchema, `${path}.${name}`);
  });
}

export function presetSecretIssues(preset: Preset, configSchemas: Readonly<Record<string, JsonObject>>): Issue[] {
  return Object.entries(preset.config ?? {}).flatMap(([extension, value]) => {
    const schema = configSchemas[extension];
    if (schema === undefined) {
      return [{ path: `config.${extension}`, message: `the config schema of ${extension} is unknown, so a secret cannot be ruled out` }];
    }
    return secretPaths(value, schema, `config.${extension}`).map((path) => ({
      path,
      message: 'secrets never go into presets',
      hint: 'remove the value; the person enters secrets on the settings page',
    }));
  });
}
