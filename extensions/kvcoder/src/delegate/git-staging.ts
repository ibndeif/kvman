import { execFile } from 'node:child_process';
import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { isMissing } from '../files/read-file.ts';

// A folder's Git staging area, marked around a program worker's run (plan 08 §8.5; ADR 0060, 4). The staged tree is
// written from a copy of the index, so the person's index file is never written by a mark. A repository's own
// configuration may name a program as its file monitor, which Git would run: it is turned off.

const run = promisify(execFile);

/** What is staged, as a tree, and the commit `HEAD` names; `head` is `null` before the first commit. */
export type StagingMark = { tree: string; head: string | null };

async function git(folder: string, args: readonly string[], signal: AbortSignal, env: NodeJS.ProcessEnv = process.env): Promise<string> {
  return (await run('git', ['-c', 'core.fsmonitor=false', ...args], { cwd: folder, signal, env, maxBuffer: 64 * 1024 * 1024 })).stdout.trim();
}

async function treeOfCopy(folder: string, index: string, signal: AbortSignal): Promise<string> {
  const scratch = await mkdtemp(path.join(tmpdir(), 'kvcoder-index-'));
  try {
    const copy = path.join(scratch, 'index');
    // A repository with nothing staged yet has no index file: Git reads a missing one as empty.
    await copyFile(index, copy).catch((error: unknown) => {
      if (!isMissing(error)) throw error;
    });
    return await git(folder, ['write-tree'], signal, { ...process.env, GIT_INDEX_FILE: copy });
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

/** The folder's mark now; `undefined` outside a repository, without Git, or while the index has unresolved conflicts. */
export async function stagingMark(folder: string, signal: AbortSignal): Promise<StagingMark | undefined> {
  try {
    const index = path.resolve(folder, await git(folder, ['rev-parse', '--git-path', 'index'], signal));
    const tree = await treeOfCopy(folder, index, signal);
    const head = await git(folder, ['rev-parse', '--verify', '--quiet', 'HEAD'], signal).catch(() => {
      signal.throwIfAborted();
      return '';
    });
    return { tree, head: head === '' ? null : head };
  } catch {
    signal.throwIfAborted();
    return undefined;
  }
}

/** How many paths differ between two staged trees. */
export async function stagedPathsBetween(folder: string, before: string, after: string, signal: AbortSignal): Promise<number> {
  const names = await git(folder, ['diff', '--no-ext-diff', '--name-only', '-z', before, after], signal);
  return names.split('\0').filter((name) => name !== '').length;
}

/** Makes the staging area `tree` again; no file in the folder and no commit changes. */
export async function restoreStaging(folder: string, tree: string, signal: AbortSignal): Promise<void> {
  await git(folder, ['read-tree', tree], signal);
}
