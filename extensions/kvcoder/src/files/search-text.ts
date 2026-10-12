import { execFile } from 'node:child_process';
import { lstat, readdir, readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { createContext, Script } from 'node:vm';
import { invalid, notFound } from '../problems.ts';
import { decodeText, isMissing } from './read-file.ts';
import { resolveInWorkspace } from './workspace-path.ts';

// `fs search` (plan 08 §8.5, ADR 0011, 8; ADR 0055): the lines that match a regular expression or a plain text, in a
// file or under a folder inside the workspace folder, in path order. Dependency and dot folders are skipped, and so is
// what Git ignores and anything that isn't UTF-8 text; a symlink is never followed, so the walk can't leave the
// workspace or loop. A file's matching runs where it can be interrupted, so a slow expression is stopped.

const matchesLimit = 200;
const lineLimit = 500;

/** The time one file's matching gets, and a whole search. */
export type SearchLimits = { fileMs: number; totalMs: number };
export const searchLimits: SearchLimits = { fileMs: 2_000, totalMs: 10_000 };

export type Match = { line: number; text: string };

/** The matches of one file; files are in path order (ADR 0034, 5). */
export type FileMatches = { path: string; matches: Match[] };

export type SearchResult = { files: FileMatches[]; truncated: boolean; reason?: 'matches' | 'time' };
export type SearchInput = { pattern: string; path?: string | undefined; literal?: boolean | undefined; glob?: string | undefined };

const skipped = (name: string): boolean => name === 'node_modules' || name.startsWith('.');
const run = promisify(execFile);

function expression(pattern: string): RegExp {
  try {
    return new RegExp(pattern);
  } catch (error) {
    if (error instanceof SyntaxError) throw invalid(`The pattern isn't a regular expression: ${error.message}`, { pattern });
    throw error;
  }
}

// A glob as an expression: `**` is any run, `*` any run but `/`, `?` one character but `/`.
function globExpression(glob: string): RegExp {
  const body = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\/?|\*|\?/g, (found) => (found.startsWith('**') ? '.*' : found === '*' ? '[^/]*' : '[^/]'));
  return new RegExp(`^${body}$`);
}

// Every file under `folder`, in path order.
async function* filesUnder(folder: string, signal: AbortSignal): AsyncGenerator<string> {
  for (const entry of (await readdir(folder, { withFileTypes: true })).sort((first, second) => (first.name < second.name ? -1 : 1))) {
    signal.throwIfAborted();
    const child = path.join(folder, entry.name);
    if (skipped(entry.name)) continue;
    if (entry.isDirectory()) yield* filesUnder(child, signal);
    else if (entry.isFile()) yield child;
  }
}

// Git lists symlinks too, and a folder on the way may be one: only a regular file whose real path is under the
// searched folder is read, as the walk never follows a link.
async function regularInside(file: string, folder: string): Promise<boolean> {
  const found = await lstat(file).catch(() => undefined);
  if (found?.isFile() !== true) return false;
  const inside = path.relative(folder, await realpath(file));
  return inside !== '' && !inside.startsWith('..') && !path.isAbsolute(inside);
}

// The files Git lists under `folder` as tracked or untracked and not ignored; `undefined` where Git can't say.
// A repository's own configuration may name a program as its file monitor, which listing would run: it is turned off.
async function gitFiles(folder: string, signal: AbortSignal): Promise<string[] | undefined> {
  let listed: string;
  try {
    listed = (await run('git', ['-c', 'core.fsmonitor=false', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: folder, signal, maxBuffer: 64 * 1024 * 1024 })).stdout;
  } catch {
    signal.throwIfAborted();
    return undefined;
  }
  const real = await realpath(folder);
  const files: string[] = [];
  for (const name of listed.split('\0').filter((entry) => entry !== '' && !entry.split('/').some(skipped)).sort()) {
    const file = path.join(real, name);
    if (await regularInside(file, real)) files.push(file);
  }
  return files;
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
  const pattern = input.literal === true ? input.pattern : expression(input.pattern);
  const requested = input.path === undefined || input.path === '' ? '.' : input.path;
  const target = await resolveInWorkspace(workspace, requested);
  const found = await stat(target).catch((error: unknown) => {
    if (isMissing(error)) throw notFound(`${requested} doesn't exist.`, { path: requested });
    throw error;
  });
  const base = await realpath(workspace);
  const named = input.glob === undefined ? undefined : globExpression(input.glob);
  const wanted = (file: string): boolean => named === undefined || named.test(input.glob?.includes('/') === true ? path.relative(target, file).split(path.sep).join('/') : path.basename(file));
  const files = !found.isDirectory() ? [target] : ((await gitFiles(target, signal)) ?? filesUnder(target, signal));
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
    const kept = hits.slice(0, matchesLimit - count);
    count += kept.length;
    if (kept.length > 0) grouped.push({ path: path.relative(base, file).split(path.sep).join('/'), matches: kept.map((index) => ({ line: index + 1, text: (lines[index] ?? '').slice(0, lineLimit) })) });
    if (kept.length < hits.length) return { files: grouped, truncated: true, reason: 'matches' };
  }
  return { files: grouped, truncated: false };
}
