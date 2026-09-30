import { watch } from 'node:fs';
import type { KernelLogger } from '../logging/logger.ts';

// Watches the folders of `path:` extensions (plan 02 §2.9, ADR 0009, 26): events are batched until 200 ms pass without
// one (real time: they are the file system's), `node_modules` is ignored, and one reload runs at a time.

export const reloadQuietMs = 200;

export type ExtensionWatcher = { close(): Promise<void> };

function insideNodeModules(filename: string | null): boolean {
  return filename !== null && filename.split(/[\\/]/).includes('node_modules');
}

export function watchExtensions(folders: ReadonlyMap<string, string>, logger: KernelLogger, reload: (changed: ReadonlySet<string>) => Promise<void>): ExtensionWatcher {
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
  const watchers = [...folders].map(([name, folder]) => {
    const watcher = watch(folder, { recursive: true }, (_event, filename) => {
      if (closed || insideNodeModules(filename)) return;
      pending.add(name);
      clearTimeout(timer);
      timer = setTimeout(flush, reloadQuietMs);
    });
    watcher.on('error', (error) => logger.warn('An extension folder can no longer be watched.', { extension: name, reason: error.message }));
    return watcher;
  });
  return {
    close: async () => {
      closed = true;
      clearTimeout(timer);
      for (const watcher of watchers) watcher.close();
      await reloading;
    },
  };
}
