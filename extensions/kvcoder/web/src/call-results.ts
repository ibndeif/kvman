import { fields } from './kvman.ts';

// What kvcoder's own `fs` commands return (plan 08 §8.5), read from a result's parsed output. A result that isn't the
// shape its command returns gives nothing, and the card then shows it as any other output (ADR 0036, 9).

export type EditResult = { replacements: number; firstChangedLine: number };
export type ReadResult = { fromLine: number; content: string };
export type Entry = { name: string; kind: 'file' | 'folder'; bytes: number };
export type FileMatches = { path: string; matches: { line: number; text: string }[] };

export function editResult(result: unknown): EditResult | undefined {
  const { replacements, firstChangedLine } = fields(result);
  return typeof replacements === 'number' && typeof firstChangedLine === 'number' ? { replacements, firstChangedLine } : undefined;
}

export function readResult(result: unknown): ReadResult | undefined {
  const { fromLine, content } = fields(result);
  return typeof fromLine === 'number' && typeof content === 'string' ? { fromLine, content } : undefined;
}

function entryOf(value: unknown): Entry[] {
  const { name, kind, bytes } = fields(value);
  return typeof name === 'string' && (kind === 'file' || kind === 'folder') && typeof bytes === 'number' ? [{ name, kind, bytes }] : [];
}

export function listResult(result: unknown): Entry[] | undefined {
  const entries: unknown = fields(result)['entries'];
  return Array.isArray(entries) ? entries.flatMap(entryOf) : undefined;
}

function matchesOf(value: unknown): FileMatches[] {
  const { path, matches } = fields(value);
  if (typeof path !== 'string' || !Array.isArray(matches)) return [];
  const found = matches.flatMap((match: unknown) => {
    const { line, text } = fields(match);
    return typeof line === 'number' && typeof text === 'string' ? [{ line, text }] : [];
  });
  return [{ path, matches: found }];
}

export function searchResult(result: unknown): FileMatches[] | undefined {
  const files: unknown = fields(result)['files'];
  return Array.isArray(files) ? files.flatMap(matchesOf) : undefined;
}
