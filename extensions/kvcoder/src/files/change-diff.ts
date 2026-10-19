import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

// The diff of one file a chat changed (plan 08 §8.6, ADR 0093, 2), with Git run as a program, never a shell: against
// `HEAD` when Git tracks the file, else against an earlier copy, or nothing for a file the chat created.

const run = promisify(execFile);
const diffLimit = 64 * 1024;

export type FileState = 'changed' | 'created' | 'deleted';
export type FileDiff = { added: number; removed: number; diff: string };

/** Git in the workspace folder: its exit code and output, or `undefined` when Git can't be run at all. */
export type Git = (args: readonly string[]) => Promise<{ code: number; out: string } | undefined>;

const failureOf = (error: unknown): { code?: unknown; stdout?: unknown } => (typeof error === 'object' && error !== null ? (error as { code?: unknown; stdout?: unknown }) : {});

export function gitIn(cwd: string, signal: AbortSignal): Git {
  return async (args) => {
    try {
      return { code: 0, out: (await run('git', ['-c', 'core.fsmonitor=false', ...args], { cwd, signal, timeout: 10_000, maxBuffer: 16 * 1024 * 1024 })).stdout };
    } catch (error) {
      signal.throwIfAborted();
      const failed = failureOf(error);
      if (failed.code === 'ENOENT') return undefined;
      if (typeof failed.code === 'number') return { code: failed.code, out: typeof failed.stdout === 'string' ? failed.stdout : '' };
      throw error;
    }
  };
}

// The diff's own header names the file as the person knows it, not the copies Git compared.
function counted(diff: string, shown: string): FileDiff {
  const lines = diff.split('\n');
  const start = lines.findIndex((line) => line.startsWith('@@'));
  if (start < 0) return { added: 0, removed: 0, diff: '' };
  const body = lines.slice(start);
  const added = body.filter((line) => line.startsWith('+')).length;
  const removed = body.filter((line) => line.startsWith('-')).length;
  const whole = [`--- a/${shown}`, `+++ b/${shown}`, ...body].join('\n');
  return { added, removed, diff: whole.length > diffLimit ? `${whole.slice(0, diffLimit)}\n[… cut at 64 KB …]` : whole };
}

/** The file's change against `HEAD`. */
export async function headDiff(git: Git, shown: string): Promise<FileDiff | undefined> {
  const done = await git(['diff', '--no-color', '--no-ext-diff', 'HEAD', '--', shown]);
  return done === undefined ? undefined : counted(done.out, shown);
}

/** The file's change against an earlier copy (`null` for nothing): Git's `--no-index` exits 1 when they differ. */
export async function copyDiff(git: Git, shown: string, real: string | undefined, earlier: Buffer | null): Promise<FileDiff | undefined> {
  const folder = await mkdtemp(path.join(tmpdir(), 'kvcoder-diff-'));
  try {
    const before = path.join(folder, 'before');
    const empty = path.join(folder, 'empty');
    await writeFile(before, earlier ?? Buffer.alloc(0));
    await writeFile(empty, Buffer.alloc(0));
    const done = await git(['diff', '--no-index', '--no-color', '--no-ext-diff', '--', before, real ?? empty]);
    return done === undefined ? undefined : counted(done.out, shown);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}
