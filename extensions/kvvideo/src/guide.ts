import { readFileSync } from 'node:fs';

/** The guide `/video` puts in a chat's prompt (plan 16 §16.1), from `docs/guide.md`. */
export function readGuide(): string {
  return readFileSync(new URL('../docs/guide.md', import.meta.url), 'utf8');
}
