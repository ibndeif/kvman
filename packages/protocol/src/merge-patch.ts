import type { Json, JsonObject } from './json.ts';

function isObject(value: Json | undefined): value is JsonObject {
  return value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value);
}

export function applyMergePatch(target: Json | undefined, patch: Json): Json {
  if (!isObject(patch)) return patch;
  const result: JsonObject = isObject(target) ? { ...target } : {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete result[key];
    else result[key] = applyMergePatch(result[key], value);
  }
  return result;
}
