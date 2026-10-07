import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { invalid, notFound } from '../problems.ts';
import { decodeText, isMissing } from './read-file.ts';
import { resolveInWorkspace } from './workspace-path.ts';

// `fs search` (plan 08 §8.5, ADR 0011, 8): the lines that match a regular expression, in a file or under a folder
// inside the workspace folder, in path order. Dependency and dot folders are skipped, and so is anything that isn't
// UTF-8 text; a symlink is never followed, so the walk can't leave the workspace or loop.

const matchesLimit = 200;
const lineLimit = 500;

export type Match = { line: number; text: string };

/** The matches of one file; files are in path order (ADR 0034, 5). */
export type FileMatches = { path: string; matches: Match[] };

export type SearchResult = { files: FileMatches[]; truncated: boolean };

const skipped = (name: string): boolean => name === 'node_modules' || name.startsWith('.');

function expression(pattern: string): RegExp {
  try {
    return new RegExp(pattern);
  } catch (error) {
    if (error instanceof SyntaxError) throw invalid(`The pattern isn't a regular expression: ${error.message}`, { pattern });
    throw error;
  }
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

export async function searchText(workspace: string, input: { pattern: string; path?: string | undefined }, signal: AbortSignal): Promise<SearchResult> {
  const pattern = expression(input.pattern);
  const requested = input.path === undefined || input.path === '' ? '.' : input.path;
  const target = await resolveInWorkspace(workspace, requested);
  const found = await stat(target).catch((error: unknown) => {
    if (isMissing(error)) throw notFound(`${requested} doesn't exist.`, { path: requested });
    throw error;
  });
  const base = await realpath(workspace);
  const files = found.isDirectory() ? filesUnder(target, signal) : [target];
  const grouped: FileMatches[] = [];
  let count = 0;
  for await (const file of files) {
    const text = decodeText(await readFile(file));
    if (text === undefined) continue;
    const matches: Match[] = [];
    let full = false;
    for (const [index, line] of text.split(/\r?\n/).entries()) {
      if (!pattern.test(line)) continue;
      full = count === matchesLimit;
      if (full) break;
      count += 1;
      matches.push({ line: index + 1, text: line.slice(0, lineLimit) });
    }
    if (matches.length > 0) grouped.push({ path: path.relative(base, file).split(path.sep).join('/'), matches });
    if (full) return { files: grouped, truncated: true };
  }
  return { files: grouped, truncated: false };
}
