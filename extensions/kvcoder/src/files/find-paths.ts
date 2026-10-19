import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { invalid, notFound } from '../problems.ts';
import { isMissing } from './read-file.ts';
import { filesIn, globMatcher } from './workspace-files.ts';
import { resolveInWorkspace } from './workspace-path.ts';

// `fs find` (plan 08 §8.5, ADR 0090, 2): the files under a folder inside the workspace folder whose path matches a
// glob, newest modified first and by path on a tie, at most 200, skipping what `fs search` skips.

const pathsLimit = 200;

export type FoundPaths = { paths: string[]; truncated: boolean };

export async function findPaths(workspace: string, input: { pattern: string; path?: string | undefined }, signal: AbortSignal): Promise<FoundPaths> {
  const requested = input.path === undefined || input.path === '' ? '.' : input.path;
  const folder = await resolveInWorkspace(workspace, requested);
  const found = await stat(folder).catch((error: unknown) => {
    if (isMissing(error)) throw notFound(`${requested} doesn't exist.`, { path: requested });
    throw error;
  });
  if (!found.isDirectory()) throw invalid(`${requested} is a file; fs find looks under a folder.`, { path: requested });
  const base = await realpath(workspace);
  const wanted = globMatcher(input.pattern, folder);
  const matched: { path: string; modified: number }[] = [];
  for await (const file of await filesIn(folder, signal)) {
    signal.throwIfAborted();
    if (!wanted(file)) continue;
    const modified = await stat(file).then((entry) => entry.mtimeMs, (error: unknown) => {
      if (isMissing(error)) return undefined;
      throw error;
    });
    if (modified !== undefined) matched.push({ path: path.relative(base, file).split(path.sep).join('/'), modified });
  }
  matched.sort((first, second) => second.modified - first.modified || (first.path < second.path ? -1 : first.path > second.path ? 1 : 0));
  return { paths: matched.slice(0, pathsLimit).map((entry) => entry.path), truncated: matched.length > pathsLimit };
}
