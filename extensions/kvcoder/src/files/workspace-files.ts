import { execFile } from 'node:child_process';
import { lstat, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

// The files `fs search` and `fs find` look at (plan 08 §8.5; ADR 0055; ADR 0090, 2): every file under a folder inside
// the workspace folder, in path order, without dependency and dot folders, and in a Git workspace without what Git
// ignores. A symlink is never followed, so the walk can't leave the workspace or loop.

const skipped = (name: string): boolean => name === 'node_modules' || name.startsWith('.');
const run = promisify(execFile);

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

/** The files under `folder`, in path order: Git's list in a Git workspace, else a walk. */
export async function filesIn(folder: string, signal: AbortSignal): Promise<AsyncIterable<string> | Iterable<string>> {
  return (await gitFiles(folder, signal)) ?? filesUnder(folder, signal);
}

// A glob as an expression: `**` is any run, `*` any run but `/`, `?` one character but `/`.
function globExpression(glob: string): RegExp {
  const body = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\/?|\*|\?/g, (found) => (found.startsWith('**') ? '.*' : found === '*' ? '[^/]*' : '[^/]'));
  return new RegExp(`^${body}$`);
}

/** Whether a file under `folder` matches `glob`: by its path from `folder` when the glob has a `/`, else by its name. */
export function globMatcher(glob: string, folder: string): (file: string) => boolean {
  const expression = globExpression(glob);
  return glob.includes('/') ? (file) => expression.test(path.relative(folder, file).split(path.sep).join('/')) : (file) => expression.test(path.basename(file));
}
