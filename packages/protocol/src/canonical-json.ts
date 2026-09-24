import type { Json } from './json.ts';

export function canonicalJson(value: Json): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const members = Object.keys(value)
      .sort()
      .flatMap((key) => {
        const member = value[key];
        return member === undefined ? [] : [`${JSON.stringify(key)}:${canonicalJson(member)}`];
      });
    return `{${members.join(',')}}`;
  }
  return JSON.stringify(value);
}
