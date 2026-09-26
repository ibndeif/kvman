import { createHash } from 'node:crypto';
import { realpathSync, statSync } from 'node:fs';
import { basename, isAbsolute, sep } from 'node:path';

export type OpenedFolder = { workspaceId: string; path: string; name: string };

export type FolderCheck = { ok: true; folder: OpenedFolder } | { ok: false; code: 'VALIDATION_FAILED' | 'WORKSPACE_INVALID'; detail: string };

// 07 §7.1: the id is the SHA-256 (lowercase hex) of the UTF-8 canonical path.
export function workspaceIdOf(canonicalPath: string): string {
  return createHash('sha256').update(canonicalPath, 'utf8').digest('hex');
}

function canonical(path: string): string | undefined {
  try {
    return realpathSync.native(path);
  } catch (error) {
    if (error instanceof Error && 'code' in error && (error.code === 'ENOENT' || error.code === 'ENOTDIR')) return undefined;
    throw error;
  }
}

function inside(path: string, folder: string): boolean {
  return path === folder || path.startsWith(folder.endsWith(sep) ? folder : `${folder}${sep}`);
}

// 07 §7.1, ADR 0127: an absolute path to an existing folder outside the kvman home folder, by its canonical path
// (symlinks resolved, the real letter case); it is named after the folder.
export function checkFolder(path: string, kvmanHome: string): FolderCheck {
  if (!isAbsolute(path)) return { ok: false, code: 'VALIDATION_FAILED', detail: `${path} is not an absolute path` };
  const resolved = canonical(path);
  if (resolved === undefined) return { ok: false, code: 'WORKSPACE_INVALID', detail: `${path} does not exist` };
  if (!statSync(resolved).isDirectory()) return { ok: false, code: 'WORKSPACE_INVALID', detail: `${path} is not a folder` };
  if (inside(resolved, canonical(kvmanHome) ?? kvmanHome)) return { ok: false, code: 'WORKSPACE_INVALID', detail: `${path} is inside the kvman home folder` };
  return { ok: true, folder: { workspaceId: workspaceIdOf(resolved), path: resolved, name: basename(resolved) || resolved } };
}

// 07 §7.1: whether a workspace's folder still exists (a moved or deleted folder is "folder not found").
export function folderExists(path: string): boolean {
  return statSync(path, { throwIfNoEntry: false })?.isDirectory() === true;
}
