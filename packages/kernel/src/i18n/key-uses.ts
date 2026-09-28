import type { Json } from '@kvman/protocol';

// A `$t` key written somewhere, with the parameters that place passes (ADR 0160).
export type KeyUse = { key: string; path: string; parameters: ReadonlySet<string> };

const wholeKey = /^\$t\.(.+)$/;
const interpolatedKey = /\{\{\s*\$t\.([^{}\s]+)\s*\}\}/g;
const none: ReadonlySet<string> = new Set();

function join(path: string, key: string | number): string {
  return path === '' ? String(key) : `${path}.${key}`;
}

function stringUses(text: string, path: string): KeyUse[] {
  const whole = wholeKey.exec(text)?.[1];
  if (whole !== undefined) return [{ key: whole, path, parameters: none }];
  return [...text.matchAll(interpolatedKey)].map((match) => ({ key: match[1] ?? '', path, parameters: none }));
}

// Every key use in a JSON value: a string that is exactly `$t.<key>`, a `{{ $t.<key> }}` inside a string, or an
// object with a string `$t`, whose other keys are the parameters and may hold key uses themselves.
export function keyUses(value: Json, path: string): KeyUse[] {
  if (typeof value === 'string') return stringUses(value, path);
  if (Array.isArray(value)) return value.flatMap((item, index) => keyUses(item, join(path, index)));
  if (value === null || typeof value !== 'object') return [];
  const key = value['$t'];
  const own: KeyUse[] = typeof key === 'string' ? [{ key, path, parameters: new Set(Object.keys(value).filter((name) => name !== '$t')) }] : [];
  const inner = Object.entries(value).filter(([name]) => typeof key !== 'string' || name !== '$t').flatMap(([name, member]) => keyUses(member, join(path, name)));
  return [...own, ...inner];
}
