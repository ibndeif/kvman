import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { createContext, Script } from 'node:vm';
import { cutInto } from '../connectors/payload-fields.ts';
import { notFound } from '../problems.ts';
import { decodeText, isMissing } from './read-file.ts';
import { filesIn, globMatcher } from './workspace-files.ts';
import { resolveInWorkspace } from './workspace-path.ts';

// `fs search` (plan 08 §8.5, ADR 0011, 8; ADR 0055): the lines that match a regular expression or a plain text, in a
// file or under a folder inside the workspace folder, in path order. Dependency and dot folders are skipped, and so is
// what Git ignores and anything that isn't UTF-8 text; a symlink is never followed, so the walk can't leave the
// workspace or loop. A file's matching runs where it can be interrupted, so a slow expression is stopped. `context`
// adds the lines around each match, and `filesOnly` gives each file's count in place of its lines (ADR 0090, 3).

const matchesLimit = 200;
const lineLimit = 500;

/** The time one file's matching gets, and a whole search. */
export type SearchLimits = { fileMs: number; totalMs: number };
export const searchLimits: SearchLimits = { fileMs: 2_000, totalMs: 10_000 };

/** A matching line, or with `context` a line around one. */
export type Match = { line: number; text: string; context?: true };

/** The matches of one file, or with `filesOnly` their count; files are in path order (ADR 0034, 5). */
export type FileMatches = { path: string; matches: Match[] } | { path: string; count: number };

export type SearchResult = { files: FileMatches[]; truncated: boolean; reason?: 'matches' | 'time'; note?: string };
export type SearchInput = { pattern: string; path?: string | undefined; literal?: boolean | undefined; glob?: string | undefined; context?: number | undefined; filesOnly?: boolean | undefined };

/** The most lines `context` adds on each side of a match. */
export const contextLimit = 10;

// The kept matches and the lines around them, each line once, in line order; `last` is the file's last real line.
function shownLines(lines: readonly string[], kept: readonly number[], context: number): Match[] {
  const last = lines.length - (lines.at(-1) === '' ? 2 : 1);
  const hits = new Set(kept);
  const shown = new Set<number>();
  for (const index of kept) for (let line = Math.max(index - context, 0); line <= Math.min(index + context, Math.max(last, index)); line += 1) shown.add(line);
  return [...shown].sort((first, second) => first - second).map((index) => ({ line: index + 1, text: (lines[index] ?? '').slice(0, lineLimit), ...(hits.has(index) ? {} : { context: true as const }) }));
}

// A pattern that isn't a valid expression, such as `terminate(`, is searched as plain text, and the result says so (ADR 0102, 13).
function expression(pattern: string): { pattern: RegExp | string; note?: string } {
  try {
    return { pattern: new RegExp(pattern) };
  } catch (error) {
    if (error instanceof SyntaxError) return { pattern, note: `The pattern isn't a regular expression (${error.message}), so it was searched as plain text.` };
    throw error;
  }
}

const matching = new Script('lines.flatMap((line, index) => (pattern.test(line) ? [index] : []))');

// The numbers of the matching lines, or `undefined` when the expression passed its time (ADR 0055, 4).
function matchingLines(lines: readonly string[], pattern: RegExp | string, timeoutMs: number): number[] | undefined {
  if (typeof pattern === 'string') return lines.flatMap((line, index) => (line.includes(pattern) ? [index] : []));
  try {
    return matching.runInContext(createContext({ lines, pattern }), { timeout: Math.max(Math.ceil(timeoutMs), 1) }) as number[];
  } catch (error) {
    // The error comes from the script's own context, so it is no `Error` of this one.
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT') return undefined;
    throw error;
  }
}

export async function searchText(workspace: string, input: SearchInput, signal: AbortSignal, limits: SearchLimits = searchLimits): Promise<SearchResult> {
  const read = input.literal === true ? { pattern: input.pattern } : expression(input.pattern);
  const found = await searchFiles(workspace, input, read.pattern, signal, limits);
  return read.note === undefined ? found : { ...found, note: read.note };
}

// With `filesOnly` there are no lines to show around a match, so `context` is ignored (ADR 0102, 13).
async function searchFiles(workspace: string, input: SearchInput, pattern: RegExp | string, signal: AbortSignal, limits: SearchLimits): Promise<SearchResult> {
  const context = input.filesOnly === true ? 0 : cutInto(input.context ?? 0, 0, contextLimit);
  const requested = input.path === undefined || input.path === '' ? '.' : input.path;
  const target = await resolveInWorkspace(workspace, requested);
  const found = await stat(target).catch((error: unknown) => {
    if (isMissing(error)) throw notFound(`${requested} doesn't exist.`, { path: requested });
    throw error;
  });
  const base = await realpath(workspace);
  const wanted = input.glob === undefined ? () => true : globMatcher(input.glob, target);
  const files = !found.isDirectory() ? [target] : await filesIn(target, signal);
  const grouped: FileMatches[] = [];
  const started = Date.now();
  let count = 0;
  for await (const file of files) {
    signal.throwIfAborted();
    if (found.isDirectory() && !wanted(file)) continue;
    const left = limits.totalMs - (Date.now() - started);
    if (left <= 0) return { files: grouped, truncated: true, reason: 'time' };
    const bytes = await readFile(file).catch((error: unknown) => {
      if (isMissing(error)) return undefined;
      throw error;
    });
    const text = bytes === undefined ? undefined : decodeText(bytes);
    if (text === undefined) continue;
    const lines = text.split(/\r?\n/);
    const hits = matchingLines(lines, pattern, Math.min(limits.fileMs, left));
    if (hits === undefined) return { files: grouped, truncated: true, reason: 'time' };
    if (hits.length === 0) continue;
    const shown = path.relative(base, file).split(path.sep).join('/');
    if (input.filesOnly === true) {
      if (grouped.length === matchesLimit) return { files: grouped, truncated: true, reason: 'matches' };
      grouped.push({ path: shown, count: hits.length });
      continue;
    }
    const kept = hits.slice(0, matchesLimit - count);
    count += kept.length;
    if (kept.length > 0) grouped.push({ path: shown, matches: shownLines(lines, kept, context) });
    if (kept.length < hits.length) return { files: grouped, truncated: true, reason: 'matches' };
  }
  return { files: grouped, truncated: false };
}
