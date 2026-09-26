import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { trustLimits } from '@kvman/protocol';
import { gatedFolder } from './workspace-jail.ts';

// A regular file under <ws>/.kvman/ with the stat the gate compares (07 §7.2): size, modification time, and inode.
export type ScannedFile = { path: string; size: number; modifiedMs: number; inode: number };

// An entry the gate cannot trust: a symlink, or anything that is neither a regular file nor a folder (ADR 0137).
export class UntrustableEntry extends Error {
  readonly path: string;

  constructor(path: string) {
    super(`${path} is not a regular file or folder`);
    this.name = 'UntrustableEntry';
    this.path = path;
  }
}

export class TrustTooLarge extends Error {
  readonly max: number;

  constructor(what: 'files' | 'bytes', max: number) {
    super(`the trusted files are more than ${max} ${what}`);
    this.name = 'TrustTooLarge';
    this.max = max;
  }
}

async function walk(root: string, folder: string, found: ScannedFile[]): Promise<void> {
  for (const name of (await readdir(join(root, folder))).sort()) {
    const path = `${folder}/${name}`;
    const stats = await lstat(join(root, path), { bigint: false });
    if (stats.isDirectory()) await walk(root, path, found);
    else if (stats.isFile()) found.push({ path, size: stats.size, modifiedMs: stats.mtimeMs, inode: stats.ino });
    else throw new UntrustableEntry(path);
    if (found.length > trustLimits.files) throw new TrustTooLarge('files', trustLimits.files);
  }
}

// Every regular file under <root>/.kvman/, sorted by path; a missing .kvman/ holds none.
export async function scanGatedFolder(root: string): Promise<ScannedFile[]> {
  const top = await lstat(join(root, gatedFolder)).catch((error: unknown) => {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined;
    throw error;
  });
  if (top === undefined) return [];
  if (!top.isDirectory()) throw new UntrustableEntry(gatedFolder);
  const found: ScannedFile[] = [];
  await walk(root, gatedFolder, found);
  if (found.reduce((total, file) => total + file.size, 0) > trustLimits.bytes) throw new TrustTooLarge('bytes', trustLimits.bytes);
  return found.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
}

export function hashFile(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(path)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex')));
  });
}
