import { ProblemError } from '@kvman/sdk';
import { cutInto } from '../connectors/payload-fields.ts';
import { invalid } from '../problems.ts';
import { readBytesLimit, readLines, readLinesLimit } from './read-file.ts';
import type { FilesEntry } from './read-text.ts';

// `fs read-files` (plan 08 §8.5, ADR 0097, 1): several files read in order, each as `fs read` reads it, sharing one
// call's 30 KB. A file that can't be read says why in its own place, and the others are still read.

export type FileToRead = { path: string; fromLine?: number | undefined; lines?: number | undefined };

// The file system's own refusals (a folder in the way, no permission) are the model's to read, as `fs read` gives them.
const refusedByFileSystem = (error: unknown): error is Error & { code: string } => error instanceof Error && 'code' in error && typeof error.code === 'string' && /^E[A-Z]+$/.test(error.code);

async function readOne(workspace: string, file: FileToRead, left: number): Promise<FilesEntry> {
  try {
    return await readLines(workspace, { path: file.path, fromLine: file.fromLine, lines: cutInto(file.lines ?? readLinesLimit, 1, readLinesLimit) }, undefined, left);
  } catch (error) {
    const problem = error instanceof ProblemError ? error : refusedByFileSystem(error) ? invalid(error.message) : undefined;
    if (problem === undefined) throw error;
    return { path: file.path, error: { code: problem.problem.code, message: problem.problem.message } };
  }
}

/** The files' reads, in order, within one read's bytes. */
export async function readFiles(workspace: string, files: readonly FileToRead[], signal: AbortSignal): Promise<{ files: FilesEntry[] }> {
  const read: FilesEntry[] = [];
  let left = readBytesLimit;
  for (const file of files) {
    signal.throwIfAborted();
    if (left <= 0) {
      read.push({ path: file.path, notRead: true });
      continue;
    }
    const entry = await readOne(workspace, file, left);
    if ('content' in entry) left -= Buffer.byteLength(entry.content, 'utf8');
    read.push(entry);
  }
  return { files: read };
}
