import { pathToFileURL } from 'node:url';
import type { Preset } from '@kvman/sdk';
import { checkAndOrder, checkReload, dependentsOf } from '../extensions/load-order.ts';
import { readExtension, readExtensions, type ExtensionFolders, type ReadExtension } from '../extensions/manifests.ts';
import { mergeCatalogs, readOwnerCatalogs, type Catalogs, type OwnerCatalogs } from '../localization/catalogs.ts';
import type { KernelLogger } from '../logging/logger.ts';
import { startPool, type PoolOptions, type WorkerPool } from '../workers/pool.ts';
import type { AbortReason } from '../workers/protocol.ts';

// The extensions of a run and the workers that load them (plan 02 §2.9). A hot reload of `path:` extensions starts a
// fresh pool with the new code; the old pool retires, so its running jobs finish on the old code. A reload that fails
// keeps the previous code and pool.

export type RunExtension = ReadExtension & { revision: number; catalogs: OwnerCatalogs };

export type ExtensionRunOptions = {
  preset: Preset;
  folders: ExtensionFolders;
  sdkVersion: string;
  kernelCatalogs: OwnerCatalogs;
  pool: Omit<PoolOptions, 'setup'> & { setup: Omit<PoolOptions['setup'], 'extensions' | 'languages'> };
  logger: KernelLogger;
};

// What a successful reload did: the reloaded extensions, and the extensions whose `kernel.started` handlers run again
// (the reloaded ones and their dependents), in load order.
export type Reload = { reloaded: RunExtension[]; startedAgain: string[] };

function catalogsOf(kernelCatalogs: OwnerCatalogs, extensions: readonly RunExtension[]): Catalogs {
  return mergeCatalogs([kernelCatalogs, ...extensions.map((extension) => extension.catalogs)]);
}

function withCatalogs(extension: ReadExtension, revision: number): RunExtension {
  return { ...extension, revision, catalogs: readOwnerCatalogs({ name: extension.name, namespace: extension.manifest.kvman.namespace, folder: extension.folder }) };
}

export type ExtensionRun = Awaited<ReturnType<typeof startExtensionRun>>;

export async function startExtensionRun(options: ExtensionRunOptions) {
  const launch = (extensions: readonly RunExtension[], catalogs: Catalogs): Promise<WorkerPool> =>
    startPool({
      ...options.pool,
      setup: {
        ...options.pool.setup,
        languages: catalogs.languages,
        extensions: extensions.map((extension) => ({
          name: extension.name,
          namespace: extension.manifest.kvman.namespace,
          entryUrl: pathToFileURL(extension.entryPath).href,
          version: extension.manifest.version,
          source: extension.source,
          revision: extension.revision,
        })),
      },
    });

  let extensions = checkAndOrder(readExtensions(options.preset, options.folders), options.sdkVersion).map((extension) => withCatalogs(extension, 0));
  let catalogs = catalogsOf(options.kernelCatalogs, extensions);
  let pool = await launch(extensions, catalogs);
  const retiring = new Set<WorkerPool>();
  const pools = (): WorkerPool[] => [pool, ...retiring];

  const warnDroppedNames = (reloaded: ReadonlySet<string>, next: WorkerPool): void => {
    const kept = new Set(next.summary.jobs.map((job) => job.name));
    for (const job of pool.summary.jobs.filter((entry) => reloaded.has(entry.owner) && !kept.has(entry.name))) {
      const dependents = [...dependentsOf(extensions, new Set([job.owner]))];
      if (dependents.length > 0) options.logger.warn('A reloaded extension dropped a name its dependents may call.', { extension: job.owner, name: job.name, dependents });
    }
  };

  return {
    pool: (): WorkerPool => pool,
    extensions: (): readonly RunExtension[] => extensions,
    catalogs: (): Catalogs => catalogs,
    folders: (): ReadonlyMap<string, string> => new Map(extensions.filter((extension) => extension.source.startsWith('path:')).map((extension) => [extension.name, extension.folder])),
    // Loads the changed extensions' new code in a fresh pool; throws, keeping everything as it was, when it fails.
    async reload(changed: ReadonlySet<string>): Promise<Reload> {
      const read = extensions.map((extension) => (changed.has(extension.name) ? readExtension(extension.name, extension.source, options.folders) : extension));
      const { ordered, warnings } = checkReload(read, changed, options.sdkVersion);
      const previous = new Map(extensions.map((extension) => [extension.name, extension]));
      const next = ordered.map((extension) => {
        const before = previous.get(extension.name);
        return changed.has(extension.name) || before === undefined ? withCatalogs(extension, (before?.revision ?? -1) + 1) : before;
      });
      const nextCatalogs = catalogsOf(options.kernelCatalogs, next);
      const nextPool = await launch(next, nextCatalogs);
      for (const warning of warnings) options.logger.warn('A reloaded extension no longer satisfies a dependent.', warning);
      warnDroppedNames(changed, nextPool);
      const old = pool;
      retiring.add(old);
      void old.retire().then(() => retiring.delete(old));
      pool = nextPool;
      extensions = next;
      catalogs = nextCatalogs;
      const startedAgain = new Set([...changed, ...dependentsOf(next, changed)]);
      return { reloaded: next.filter((extension) => changed.has(extension.name)), startedAgain: next.map((extension) => extension.name).filter((name) => startedAgain.has(name)) };
    },
    abortAll: (reason: AbortReason): void => {
      for (const each of pools()) each.abortAll(reason);
    },
    idle: async (): Promise<void> => {
      await Promise.all(pools().map((each) => each.idle()));
    },
    close: async (): Promise<void> => {
      await Promise.all(pools().map((each) => each.close()));
    },
  };
}
