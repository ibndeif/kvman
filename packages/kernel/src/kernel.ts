import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { z, type Caller, type Json, type Preset, type Workspace } from '@kvman/sdk';
import { systemClock } from './clock.ts';
import { checkAndOrder } from './extensions/load-order.ts';
import { readExtensions } from './extensions/manifests.ts';
import { createIdGenerator } from './ids.ts';
import { openLogFile } from './logging/log-file.ts';
import type { KernelLogger, LogLevel } from './logging/logger.ts';
import { kernelProblem } from './problems.ts';
import { kernelSdkVersion } from './sdk-version.ts';
import { openSecretsFile } from './secrets/secrets-file.ts';
import { kernelSettingDefinitions } from './settings/kernel-settings.ts';
import { createSettings } from './settings/settings.ts';
import { openDatabase, type Connection } from './storage/database.ts';
import { startPool, type WorkerPool } from './workers/pool.ts';

// Starting the kernel for a run (plan 02 §2.14, steps 2, 3, 6, and 7 so far), and running sync jobs on it.

export type KernelOptions = {
  home: string;
  homeFolder: string;
  preset: Preset;
  presetFolder: string;
  bundled: ReadonlyMap<string, string>;
  logLevel: LogLevel;
};

export type ExecOptions = { caller: Caller; workspaceId: string };

export type Kernel = {
  exec(name: string, input: unknown, options: ExecOptions): Promise<unknown>;
  close(): Promise<void>;
};

export const homeWorkspaceId = 'home';

function workspaceOf(connection: Connection, homeFolder: string, id: string): Workspace {
  if (id === homeWorkspaceId) return { id, name: path.basename(homeFolder), path: homeFolder };
  const row = connection.prepare<[string], Workspace>('SELECT id, name, path FROM workspaces WHERE id = ? AND open = 1').get(id);
  if (row === undefined) throw kernelProblem('NOT_FOUND', `There is no open workspace ${id}.`, { workspaceId: id });
  return row;
}

function poolSize(connection: Connection, presetSettings: Record<string, Json>, logger: KernelLogger): { size: number; concurrency: number } {
  const definitions = new Map(kernelSettingDefinitions().map((definition) => [definition.key, definition]));
  const settings = createSettings({ connection, definitions, presetValues: presetSettings, logger });
  const number = (key: string): number => z.number().parse(settings.resolve(key, homeWorkspaceId).value);
  return { size: number('kernel.workers'), concurrency: number('kernel.workerConcurrency') };
}

export async function startKernel(options: KernelOptions): Promise<Kernel> {
  mkdirSync(options.home, { recursive: true });
  const database = path.join(options.home, 'kvman.db');
  const connection = openDatabase(database);
  const logFile = openLogFile(options.home, options.logLevel);
  const secrets = openSecretsFile(options.home);
  const ids = createIdGenerator(systemClock);
  let pool: WorkerPool;
  try {
    const presetSettings = options.preset.settings ?? {};
    const extensions = checkAndOrder(readExtensions(options.preset, { home: options.home, presetFolder: options.presetFolder, bundled: options.bundled }), kernelSdkVersion());
    pool = await startPool({
      ...poolSize(connection, presetSettings, logFile.logger),
      setup: {
        home: options.home,
        database,
        extensions: extensions.map((extension) => ({ name: extension.name, namespace: extension.manifest.kvman.namespace, entryUrl: pathToFileURL(extension.entryPath).href })),
        presetSettings,
        logLevel: options.logLevel,
      },
      logger: logFile.logger,
      writeSecret: (write) => (write.action === 'set' ? secrets.set(write.extension, write.name, write.value) : secrets.delete(write.extension, write.name)),
    });
  } catch (error) {
    logFile.close();
    connection.close();
    throw error;
  }
  return {
    exec: async (name, input, { caller, workspaceId }) => pool.run({ id: ids(), name, input, workspace: workspaceOf(connection, options.homeFolder, workspaceId), caller }),
    close: async () => {
      await pool.close();
      logFile.close();
      connection.close();
    },
  };
}
