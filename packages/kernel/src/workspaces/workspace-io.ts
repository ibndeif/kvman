import { glob, lstat, mkdir, open, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { filesLimits, type FileEntry, type FileKind, type FileStat } from '@kvman/protocol';
import { gatedFolder } from './workspace-jail.ts';

// A file operation the workspace refuses; the RPC edge turns it into a Problem.
export class FileRefusal extends Error {
  readonly code: 'VALIDATION_FAILED' | 'PAYLOAD_TOO_LARGE';
  readonly params: Record<string, string | number> | undefined;
  readonly hint: string | undefined;

  constructor(code: 'VALIDATION_FAILED' | 'PAYLOAD_TOO_LARGE', message: string, extras: { params?: Record<string, string | number>; hint?: string } = {}) {
    super(message);
    this.name = 'FileRefusal';
    this.code = code;
    this.params = extras.params;
    this.hint = extras.hint;
  }
}

function kindOf(stats: { isFile(): boolean; isDirectory(): boolean; isSymbolicLink(): boolean }): FileKind {
  if (stats.isFile()) return 'file';
  if (stats.isDirectory()) return 'directory';
  return stats.isSymbolicLink() ? 'symlink' : 'other';
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR');
}

function tooLarge(): FileRefusal {
  return new FileRefusal('PAYLOAD_TOO_LARGE', `a workspace file read or written through ctx.files holds at most ${filesLimits.fileBytes} bytes`, {
    params: { limit: 'file', max: filesLimits.fileBytes },
  });
}

// The kernel code for an operating-system failure of a workspace file; the path and contents stay out of problems.
export function errnoCode(error: unknown): 'NOT_FOUND' | 'VALIDATION_FAILED' | 'CAPABILITY_DENIED' | 'STORAGE_FULL' | 'INTERNAL' {
  const errno = error instanceof Error && 'code' in error ? error.code : undefined;
  if (errno === 'ENOENT' || errno === 'ENOTDIR') return 'NOT_FOUND';
  if (errno === 'EISDIR') return 'VALIDATION_FAILED';
  if (errno === 'EACCES' || errno === 'EPERM') return 'CAPABILITY_DENIED';
  return errno === 'ENOSPC' ? 'STORAGE_FULL' : 'INTERNAL';
}

// A file's bytes, a chunk at a time, into `take`.
export async function copyFile(real: string, chunkBytes: number, take: (bytes: Uint8Array) => Promise<void>): Promise<void> {
  const handle = await open(real, 'r');
  try {
    const buffer = Buffer.alloc(chunkBytes);
    for (;;) {
      const { bytesRead } = await handle.read(buffer, 0, chunkBytes, null);
      if (bytesRead === 0) return;
      await take(buffer.subarray(0, bytesRead));
    }
  } finally {
    await handle.close();
  }
}

// 05 §5.4, ADR 0136: the operations of ctx.files on paths the jail already resolved.
export async function readText(real: string): Promise<string> {
  const stats = await stat(real);
  if (stats.isDirectory()) throw new FileRefusal('VALIDATION_FAILED', 'the path is a folder; list it instead');
  if (stats.size > filesLimits.fileBytes) throw tooLarge();
  return readFile(real, 'utf8');
}

export async function writeBytes(real: string, bytes: Uint8Array): Promise<void> {
  if (bytes.byteLength > filesLimits.fileBytes) throw tooLarge();
  await mkdir(dirname(real), { recursive: true });
  await writeFile(real, bytes);
}

export async function listFolder(real: string): Promise<FileEntry[]> {
  const names = (await readdir(real)).sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  return Promise.all(names.map(async (name) => {
    const stats = await lstat(join(real, name));
    return { name, kind: kindOf(stats), size: stats.size };
  }));
}

export async function statPath(real: string): Promise<FileStat | undefined> {
  try {
    const stats = await stat(real);
    return { kind: kindOf(stats), size: stats.size, modifiedAt: Math.floor(stats.mtimeMs) };
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw error;
  }
}

export async function makeFolder(real: string): Promise<void> {
  await mkdir(real, { recursive: true });
}

export async function removePath(real: string, recursive: boolean): Promise<void> {
  const stats = await lstat(real).catch((error: unknown) => {
    if (isMissing(error)) return undefined;
    throw error;
  });
  if (stats === undefined) return;
  if (stats.isDirectory() && !recursive) throw new FileRefusal('VALIDATION_FAILED', 'the path is a folder', { hint: 'pass { recursive: true } to remove a folder' });
  await rm(real, { recursive, force: true });
}

// Relative paths under the root that match, sorted; `.kvman/` is left out unless the gate is open.
export async function globFiles(root: string, pattern: string, includeGated: boolean): Promise<string[]> {
  const matches: string[] = [];
  const exclude = (path: string): boolean => !includeGated && (path === gatedFolder || path.startsWith(`${gatedFolder}/`));
  for await (const match of glob(pattern, { cwd: root, exclude })) {
    const path = match.split('\\').join('/');
    if (exclude(path)) continue;
    matches.push(path);
    if (matches.length > filesLimits.globMatches) {
      throw new FileRefusal('PAYLOAD_TOO_LARGE', `the pattern matches more than ${filesLimits.globMatches} paths`, {
        params: { limit: 'glob', max: filesLimits.globMatches }, hint: 'narrow the pattern',
      });
    }
  }
  return matches.sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
}
