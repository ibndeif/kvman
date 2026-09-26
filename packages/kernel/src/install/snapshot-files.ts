import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readdir, readlink, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { canonicalJson, type FileList, type FileListEntry } from '@kvman/protocol';
import { isUnreadable } from './file-errors.ts';
import { InstallFailure, sourceInvalid } from './install-failure.ts';

// The files a snapshot folder keeps beside its tree; they describe the tree and are not part of it (05 §5.12).
export const snapshotRecords = new Set(['manifest.json', 'files.json']);

function sha256File(file: string): Promise<string> {
  return new Promise((done, fail) => {
    const hash = createHash('sha256');
    createReadStream(file).on('data', (chunk) => hash.update(chunk)).on('error', fail).on('end', () => done(hash.digest('hex')));
  });
}

function inside(root: string, target: string): boolean {
  const path = relative(root, target);
  return !isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`);
}

async function linkEntry(root: string, file: string, path: string): Promise<FileListEntry> {
  const target = await readlink(file);
  const resolved = resolve(dirname(file), target);
  const real = await realpath(file).catch(() => resolved);
  if (!inside(root, resolved) || !inside(await realpath(root), real)) throw sourceInvalid(`${path} links outside the package`, { params: { file: path } });
  return { path, link: target };
}

async function entriesOf(root: string, folder: string, list: FileListEntry[]): Promise<void> {
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const file = join(folder, entry.name);
    const path = relative(root, file).split(sep).join('/');
    if (folder === root && snapshotRecords.has(entry.name)) continue;
    const stats = await lstat(file);
    if (stats.isSymbolicLink()) list.push(await linkEntry(root, file, path));
    else if (stats.isDirectory()) await entriesOf(root, file, list);
    else if (stats.isFile()) list.push({ path, size: stats.size, sha256: await sha256File(file) });
  }
}

// 06 §6.2 step 3: every file with its size and sha256, and each symlink that stays inside the tree, sorted by path.
// A symlink leaving the tree refuses the package (step 2).
export async function buildFileList(root: string): Promise<FileList> {
  const list: FileListEntry[] = [];
  await entriesOf(resolve(root), resolve(root), list);
  return list.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
}

// The snapshot digest: the sha256 of the file list's canonical JSON, so the same tree has the same digest anywhere.
export function snapshotDigest(list: FileList): string {
  return createHash('sha256').update(canonicalJson(list)).digest('hex');
}

// 06 §6.5: the tree still hashes to its digest. A tree that can no longer be read does not.
export async function verifyTree(root: string, digest: string): Promise<boolean> {
  try {
    return snapshotDigest(await buildFileList(root)) === digest;
  } catch (error) {
    if (error instanceof InstallFailure || isUnreadable(error)) return false;
    throw error;
  }
}
