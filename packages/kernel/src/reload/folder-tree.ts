import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

// Watching an extension's folder (plan 02 §2.9, ADR 0085, 8). Linux has no native recursive watch, and Node's emulation
// watches every file, `node_modules` included, which can use up the account's inotify watches; so on Linux the kernel
// watches the folder and each folder below it, and skips `node_modules`, `.git`, and every folder whose name starts with
// a dot. macOS and Windows keep the native recursive watch, whose events from those folders are ignored.

export type Watcher = { close(): void; on(event: 'error', listener: (error: Error) => void): unknown };
export type WatchFolder = (folder: string, options: { recursive: boolean }, listener: (event: string, filename: string | null) => void) => Watcher;
export type FolderTree = { close(): void };

export const isSkipped = (name: string): boolean => name === 'node_modules' || name.startsWith('.');

/** Whether a path relative to the watched folder lies in, or is, a skipped folder. */
export function insideSkipped(relative: string): boolean {
  return relative.split(/[\\/]/).some(isSkipped);
}

const isFolder = (target: string): boolean => statSync(target, { throwIfNoEntry: false })?.isDirectory() === true;

// One watch per folder: a folder that appears is watched, and one that goes away is dropped with the folders below it.
function watchEachFolder(root: string, watch: WatchFolder, changed: () => void, failed: (error: Error) => void): FolderTree {
  const watchers = new Map<string, Watcher>();
  const drop = (folder: string): void => {
    for (const [watched, watcher] of watchers) {
      if (watched !== folder && !watched.startsWith(`${folder}${path.sep}`)) continue;
      watcher.close();
      watchers.delete(watched);
    }
  };
  const seen = (folder: string, filename: string | null): void => {
    if (filename !== null) {
      if (isSkipped(filename)) return;
      const target = path.join(folder, filename);
      if (isFolder(target)) add(target);
      else drop(target);
    }
    changed();
  };
  const add = (folder: string): void => {
    if (watchers.has(folder)) return;
    try {
      const watcher = watch(folder, { recursive: false }, (_event, filename) => seen(folder, filename));
      watcher.on('error', failed);
      watchers.set(folder, watcher);
      for (const entry of readdirSync(folder, { withFileTypes: true })) if (entry.isDirectory() && !isSkipped(entry.name)) add(path.join(folder, entry.name));
    } catch (error) {
      failed(error instanceof Error ? error : new Error(String(error)));
    }
  };
  add(root);
  return { close: () => drop(root) };
}

function watchRecursively(root: string, watch: WatchFolder, changed: () => void, failed: (error: Error) => void): FolderTree {
  const watcher = watch(root, { recursive: true }, (_event, filename) => {
    if (filename === null || !insideSkipped(filename)) changed();
  });
  watcher.on('error', failed);
  return { close: () => watcher.close() };
}

export function watchFolderTree(root: string, platform: NodeJS.Platform, watch: WatchFolder, changed: () => void, failed: (error: Error) => void): FolderTree {
  return platform === 'linux' ? watchEachFolder(root, watch, changed, failed) : watchRecursively(root, watch, changed, failed);
}
