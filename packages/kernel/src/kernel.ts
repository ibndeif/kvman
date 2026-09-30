import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { z, type Caller, type Job, type Json, type Preset, type Workspace } from '@kvman/sdk';
import { systemClock, type CancelTimer, type Clock } from './clock.ts';
import { checkAndOrder } from './extensions/load-order.ts';
import { readExtensions } from './extensions/manifests.ts';
import { createIdGenerator } from './ids.ts';
import { createDispatcher } from './jobs/dispatcher.ts';
import { createJobRows } from './jobs/job-rows.ts';
import { createProgressHub, type ProgressChunk } from './jobs/progress-hub.ts';
import { answerWorker, queuableCommand } from './kernel-requests.ts';
import { runStartedHandlers, stopJobs } from './kernel-lifecycle.ts';
import { openLogFile } from './logging/log-file.ts';
import type { KernelLogger, LogLevel } from './logging/logger.ts';
import { kernelProblem } from './problems.ts';
import { createScheduleRows } from './schedules/schedule-rows.ts';
import { kernelSdkVersion } from './sdk-version.ts';
import { openSecretsFile } from './secrets/secrets-file.ts';
import { kernelSettingDefinitions } from './settings/kernel-settings.ts';
import { createSettings } from './settings/settings.ts';
import { openDatabase, type Connection } from './storage/database.ts';
import { keepWasmCode } from './wasm-code-gc.ts';
import { startPool } from './workers/pool.ts';

// Starting the kernel for a run and stopping it (plan 02 §2.14), and the calls a test or the HTTP layer makes on it.

export type KernelOptions = {
  home: string;
  homeFolder: string;
  preset: Preset;
  presetFolder: string;
  bundled: ReadonlyMap<string, string>;
  logLevel: LogLevel;
  clock?: Clock;
};

export type ExecOptions = { caller: Caller; workspaceId: string };

export type Kernel = {
  exec(name: string, input: unknown, options: ExecOptions): Promise<unknown>;
  execAsync(name: string, input: unknown, options: ExecOptions): Promise<string>;
  cancel(jobId: string): void;
  waitForJob(jobId: string): Promise<Job>;
  watchProgress(jobId: string, listener: (chunk: ProgressChunk) => void): () => void;
  settled(): Promise<void>;
  close(): Promise<void>;
};

export const homeWorkspaceId = 'home';

const hourMs = 60 * 60 * 1000;
const dayMs = 24 * hourMs;

function workspaceOf(connection: Connection, homeFolder: string, id: string): Workspace {
  if (id === homeWorkspaceId) return { id, name: path.basename(homeFolder), path: homeFolder };
  const row = connection.prepare<[string], Workspace>('SELECT id, name, path FROM workspaces WHERE id = ? AND open = 1').get(id);
  if (row === undefined) throw kernelProblem('NOT_FOUND', `There is no open workspace ${id}.`, { workspaceId: id });
  return row;
}

function kernelSettings(connection: Connection, presetSettings: Record<string, Json>, logger: KernelLogger) {
  const definitions = new Map(kernelSettingDefinitions().map((definition) => [definition.key, definition]));
  const settings = createSettings({ connection, definitions, presetValues: presetSettings, logger });
  const number = (key: string): number => z.number().parse(settings.resolve(key, homeWorkspaceId).value);
  return { workers: number('kernel.workers'), concurrency: number('kernel.workerConcurrency'), retentionDays: number('kernel.jobs.retentionDays') };
}

export async function startKernel(options: KernelOptions): Promise<Kernel> {
  keepWasmCode();
  mkdirSync(options.home, { recursive: true });
  const clock = options.clock ?? systemClock;
  const database = path.join(options.home, 'kvman.db');
  const connection = openDatabase(database);
  const logFile = openLogFile(options.home, options.logLevel);
  const secrets = openSecretsFile(options.home);
  const ids = createIdGenerator(clock);
  const rows = createJobRows(connection, clock, ids);
  const schedules = createScheduleRows(connection, clock, ids);
  const hub = createProgressHub();
  const workspace = (id: string): Workspace => workspaceOf(connection, options.homeFolder, id);
  const dispatcher = createDispatcher({ connection, rows, schedules, clock, logger: logFile.logger, workspaceOf: workspace });
  let retention: CancelTimer | undefined;
  const closeStorage = (): void => {
    retention?.();
    logFile.close();
    connection.close();
  };
  try {
    const presetSettings = options.preset.settings ?? {};
    const settings = kernelSettings(connection, presetSettings, logFile.logger);
    const extensions = checkAndOrder(readExtensions(options.preset, { home: options.home, presetFolder: options.presetFolder, bundled: options.bundled }), kernelSdkVersion());
    const pool = await startPool({
      size: settings.workers,
      concurrency: settings.concurrency,
      setup: {
        home: options.home,
        database,
        extensions: extensions.map((extension) => ({ name: extension.name, namespace: extension.manifest.kvman.namespace, entryUrl: pathToFileURL(extension.entryPath).href })),
        presetSettings,
        logLevel: options.logLevel,
      },
      logger: logFile.logger,
      events: {
        request: (request) => answerWorker({ dispatcher, schedules, secrets, clock }, request),
        progress: (rootId, chunk) => hub.publish(rootId, chunk),
        syncEnded: (end) => dispatcher.deliverSyncEnd(end),
        slotFreed: () => dispatcher.slotFreed(),
      },
    });
    dispatcher.attach(pool, pool.summary.handlers);
    const cleanUp = (): void => {
      rows.deleteFinishedBefore(clock.now() - settings.retentionDays * dayMs);
      retention = clock.setTimer(hourMs, cleanUp);
    };
    cleanUp();
    dispatcher.interruptLeftovers();
    dispatcher.wake();
    const started = pool.summary.handlers.filter((handler) => handler.point === 'kernel.started').map((handler) => handler.extension);
    await runStartedHandlers(dispatcher, logFile.logger, extensions.map((extension) => extension.name), started);
    return {
      exec: async (name, input, { caller, workspaceId }) =>
        pool.run({ id: ids(), name, input, workspace: workspace(workspaceId), caller, async: false, fromHandler: false }),
      execAsync: async (name, input, { caller, workspaceId }) => {
        const { retries } = queuableCommand(pool.summary, name, caller);
        workspace(workspaceId);
        return dispatcher.queue({ name, input, workspaceId, caller, retries, fromHandler: false, runAt: clock.now() });
      },
      cancel: (jobId) => dispatcher.cancel(jobId),
      waitForJob: (jobId) => dispatcher.waitForJob(jobId),
      watchProgress: (jobId, listener) => hub.watch(jobId, listener),
      settled: () => dispatcher.settled(),
      close: async () => {
        await stopJobs(dispatcher, pool);
        closeStorage();
      },
    };
  } catch (error) {
    closeStorage();
    throw error;
  }
}
