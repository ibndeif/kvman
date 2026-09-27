import type { Json, JsonObject } from '@kvman/protocol';

// 07 §7.4, ADR 0149: kernel.preset.update applies the patch with RFC 7396 semantics.
export function mergePatch(target: Json, patch: Json): Json {
  if (!isObject(patch)) return patch;
  const source: JsonObject = isObject(target) ? target : {};
  const result: JsonObject = { ...source };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) {
      delete result[key];
    } else {
      const current = source[key];
      result[key] = mergePatch(current === undefined ? {} : current, value);
    }
  }
  return result;
}

function isObject(value: Json): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
