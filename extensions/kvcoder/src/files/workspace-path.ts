import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { invalid } from '../problems.ts';

// Where `fs` may write (plan 08 §8.5, ADR 0009, 158): inside the workspace folder, after symlinks are resolved. A
// path that doesn't exist yet is resolved on its nearest existing ancestor.

const isMissing = (error: unknown): boolean => error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR');

// The real path of `target`, resolving the nearest ancestor that exists and appending what doesn't exist yet.
async function realPathOf(target: string, requested: string): Promise<string> {
  const missing: string[] = [];
  for (let existing = target; ; existing = path.dirname(existing)) {
    try {
      return path.join(await realpath(existing), ...missing.reverse());
    } catch (error) {
      if (!isMissing(error)) throw error;
      // A symlink to nothing would make a write create its target, wherever that is.
      if ((await lstat(existing).catch(() => undefined))?.isSymbolicLink() === true) throw invalid(`${requested} goes through a symlink that points nowhere.`, { path: requested });
      if (path.dirname(existing) === existing) throw error;
      missing.push(path.basename(existing));
    }
  }
}

/** The lexical path of `requested` in the workspace folder: the key calls on one file are ordered by. */
export const lexicalPath = (workspace: string, requested: string): string => path.resolve(workspace, requested);

/** The real path of `requested` when it is inside the workspace folder; otherwise a `VALIDATION_FAILED` Problem. */
export async function resolveInWorkspace(workspace: string, requested: string): Promise<string> {
  const base = await realpath(workspace);
  const target = await realPathOf(lexicalPath(workspace, requested), requested);
  const relative = path.relative(base, target);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw invalid(`${requested} is outside the workspace folder.`, { path: requested });
  return target;
}
