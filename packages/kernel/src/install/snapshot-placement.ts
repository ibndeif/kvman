import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Manifest } from '@kvman/protocol';
import { isUnreadable } from './file-errors.ts';
import { snapshotFolder, type InstallPaths } from './install-paths.ts';
import { buildFileList, snapshotDigest } from './snapshot-files.ts';

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (isUnreadable(error)) return false;
    throw error;
  }
}

// 06 §6.2 steps 6–7: the tree must still hash to the staged digest; it then gets its manifest.json and files.json
// and moves atomically to snapshots/<digest>/. A snapshot already there (a kept one, or the same version) stays, and
// the staging folder goes. Returns the digest, or undefined when the tree changed.
export async function placeSnapshot(paths: InstallPaths, tree: string, manifest: Manifest, expected?: string): Promise<string | undefined> {
  const list = await buildFileList(tree);
  const digest = snapshotDigest(list);
  const staging = dirname(tree);
  if (expected !== undefined && digest !== expected) {
    await rm(staging, { recursive: true, force: true });
    return undefined;
  }
  await writeFile(join(tree, 'manifest.json'), JSON.stringify(manifest));
  await writeFile(join(tree, 'files.json'), JSON.stringify(list));
  await mkdir(paths.snapshots, { recursive: true, mode: 0o700 });
  const target = snapshotFolder(paths, digest);
  if (!(await exists(target))) await rename(tree, target);
  await rm(staging, { recursive: true, force: true });
  return digest;
}
