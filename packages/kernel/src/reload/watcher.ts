import type { KernelLogger } from '../logging/logger.ts';
import { watchFolderTree, type WatchFolder } from './folder-tree.ts';

// Watches the folders of `path:` extensions (plan 02 §2.9, ADR 0009, 26; ADR 0085, 8): events are batched until 200 ms
// pass without one (real time: they are the file system's), `node_modules`, `.git`, and dot-folders are skipped, and one
// reload runs at a time.

export const reloadQuietMs = 200;

export type ExtensionWatcher = { close(): Promise<void> };
export type WatchSystem = { platform: NodeJS.Platform; watch: WatchFolder };

export function watchExtensions(folders: ReadonlyMap<string, string>, logger: KernelLogger, reload: (changed: ReadonlySet<string>) => Promise<void>, system: WatchSystem): ExtensionWatcher {
  const pending = new Set<string>();
  let timer: NodeJS.Timeout | undefined;
  let reloading: Promise<void> = Promise.resolve();
  let closed = false;
  const flush = (): void => {
    timer = undefined;
    const changed = new Set(pending);
    pending.clear();
    reloading = reloading.then(() => (closed ? undefined : reload(changed)));
  };
  const trees = [...folders].map(([name, folder]) =>
    watchFolderTree(
      folder,
      system.platform,
      system.watch,
      () => {
        if (closed) return;
        pending.add(name);
        clearTimeout(timer);
        timer = setTimeout(flush, reloadQuietMs);
      },
      (error) => logger.warn('An extension folder can no longer be watched.', { extension: name, reason: error.message }),
    ),
  );
  return {
    close: async () => {
      closed = true;
      clearTimeout(timer);
      for (const tree of trees) tree.close();
      await reloading;
    },
  };
}
