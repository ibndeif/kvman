import type { Json, JsonObject } from '@kvman/protocol';

// A manifest under validation is untrusted JSON: every rule reads it through these, so a malformed part is left to
// the manifest schema's issues while the rules still check everything else (ADR 0042).

export function objectOf(value: Json | undefined): JsonObject | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
}

export function arrayAt(value: Json | undefined, key: string): Json[] {
  const member = objectOf(value)?.[key];
  return Array.isArray(member) ? member : [];
}

export function stringAt(value: Json | undefined, key: string): string | undefined {
  const member = objectOf(value)?.[key];
  return typeof member === 'string' ? member : undefined;
}

export function numberAt(value: Json | undefined, key: string): number | undefined {
  const member = objectOf(value)?.[key];
  return typeof member === 'number' ? member : undefined;
}

export function has(value: Json | undefined, key: string): boolean {
  return objectOf(value)?.[key] !== undefined;
}
