import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { z, type Caller, type Job, type Json, type Preset, type Workspace } from '@kvman/sdk';
import { systemClock, type CancelTimer, type Clock } from './clock.ts';
import { createIdGenerator } from './ids.ts';
import { createDispatcher } from './jobs/dispatcher.ts';
import { createJobRows } from './jobs/job-rows.ts';
import { createProgressHub, type ProgressChunk } from './jobs/progress-hub.ts';
import { answerWorker, queuableCommand } from './kernel-requests.ts';
import { runStartedHandlers, stopRun } from './kernel-lifecycle.ts';
import { kernelVersion } from './kernel-version.ts';
import { createKernelWeb, type KernelWeb } from './kernel-web.ts';
import { installMissing } from './extensions/npm-install.ts';
import { readExtensions } from './extensions/manifests.ts';
import { checkTrust, type TrustDecision } from './extensions/trust.ts';
import { createFiles } from './files/files.ts';
import { kernelCatalogOwner, readOwnerCatalogs, type Catalog } from './localization/catalogs.ts';
import { openLogFile } from './logging/log-file.ts';
import type { KernelLogger, LogLevel } from './logging/logger.ts';
import { createProcessService } from './processes/process-service.ts';
import { reloadExtensions } from './reload/reload-extensions.ts';
import { watchExtensions, type ExtensionWatcher } from './reload/watcher.ts';
import { startExtensionRun } from './run/extension-run.ts';
import { createScheduleRows } from './schedules/schedule-rows.ts';
import { kernelSdkVersion } from './sdk-version.ts';
import { openSecretsFile } from './secrets/secrets-file.ts';
import { kernelSettingDefinitions } from './settings/kernel-settings.ts';
import { createSettings } from './settings/settings.ts';
import { openDatabase, type Connection } from './storage/database.ts';
import { keepWasmCode } from './wasm-code-gc.ts';
import { createWorkspaces, homeWorkspaceId, openWorkspaceOf } from './workspaces/workspaces.ts';

// Starting the kernel for a run and stopping it (plan 02 §2.14), and the calls a test or the HTTP layer makes on it.

export type KernelMode = 'web';

export type KernelOptions = {
  home: string;
  homeFolder: string;
  preset: Preset;
  presetFolder: string;
  bundled: ReadonlyMap<string, string>;
  mode: KernelMode;
  logLevel: LogLevel;
  // Whether log records also go to the terminal (a kvman run's short log, ADR 0009, 49).
  terminalLog: boolean;
  // The folder kvman was started from, opened as a workspace (plan 01 §1.2).
  startFolder: string;
  trust: TrustDecision;
  clock?: Clock;
};

// `jobId` gives a sync call the id its caller already knows, as HTTP does to cancel it (plan 04).
export type ExecOptions = { caller: Caller; workspaceId: string; jobId?: string };

export type Kernel = {
  exec(name: string, input: unknown, options: ExecOptions): Promise<unknown>;
  execAsync(name: string, input: unknown, options: ExecOptions): Promise<string>;
  cancel(jobId: string): void;
  waitForJob(jobId: string): Promise<Job>;
  watchProgress(jobId: string, listener: (chunk: ProgressChunk) => void): () => void;
  catalog(language: string): Catalog;
  web: KernelWeb;
  startWorkspace: Workspace;
  settled(): Promise<void>;
  close(): Promise<void>;
};

const hourMs = 60 * 60 * 1000;
const dayMs = 24 * hourMs;

function kernelSettings(connection: Connection, presetSettings: Record<string, Json>, languages: readonly string[], logger: KernelLogger) {
  const definitions = new Map(kernelSettingDefinitions(languages).map((definition) => [definition.key, definition]));
  const settings = createSettings({ connection, definitions, presetValues: presetSettings, logger });
  const number = (key: string): number => z.number().parse(settings.resolve(key, homeWorkspaceId).value);
  return { settings, workers: number('kernel.workers'), concurrency: number('kernel.workerConcurrency'), retentionDays: number('kernel.jobs.retentionDays') };
}

export async function startKernel(options: KernelOptions): Promise<Kernel> {
  keepWasmCode();
  mkdirSync(options.home, { recursive: true });
  const clock = options.clock ?? systemClock;
  const startedAt = clock.now();
  const database = path.join(options.home, 'kvman.db');
  const connection = openDatabase(database);
  const logFile = openLogFile(options.home, options.logLevel, options.terminalLog);
  const logger = logFile.logger;
  const secrets = openSecretsFile(options.home);
  const ids = createIdGenerator(clock);
  const workspaces = createWorkspaces(connection, options.homeFolder, ids);
  const rows = createJobRows(connection, clock, ids, workspaces.closed);
  const schedules = createScheduleRows(connection, clock, ids, workspaces.closed);
  const hub = createProgressHub();
  const workspace = (id: string) => openWorkspaceOf(connection, options.homeFolder, id);
  const dispatcher = createDispatcher({ connection, rows, schedules, clock, logger, workspaceOf: workspace });
  const processes = createProcessService({ connection, home: options.home, clock, logger, platform: process.platform, deliverAlong: (work) => dispatcher.deliverAlong(work) });
  const stopping = new AbortController();
  let retention: CancelTimer | undefined;
  let watcher: ExtensionWatcher | undefined;
  const closeStorage = (): void => {
    retention?.();
    logFile.close();
    connection.close();
  };
  try {
    processes.killLeftovers();
    const folders = { home: options.home, presetFolder: options.presetFolder, bundled: options.bundled };
    installMissing(options.preset, options.home, logger, process.platform);
    await checkTrust(connection, clock, readExtensions(options.preset, folders), options.trust);
    const presetSettings = options.preset.settings ?? {};
    const kernelCatalogs = readOwnerCatalogs(kernelCatalogOwner);
    const settings = kernelSettings(connection, presetSettings, [...kernelCatalogs.keys()], logger);
    const health = () => ({
      version: kernelVersion(),
      preset: options.preset.name,
      mode: options.mode,
      workers: settings.workers,
      uptimeMs: clock.now() - startedAt,
      languages: run.catalogs().languages,
    });
    const run = await startExtensionRun({
      preset: options.preset,
      folders,
      sdkVersion: kernelSdkVersion(),
      kernelCatalogs,
      logger,
      pool: {
        size: settings.workers,
        concurrency: settings.concurrency,
        setup: { home: options.home, homeFolder: options.homeFolder, database, presetSettings, logLevel: options.logLevel, terminalLog: options.terminalLog },
        logger,
        events: {
          request: (request) => answerWorker({ dispatcher, schedules, secrets, clock, workspaces, processes, health }, request),
          progress: (rootId, chunk) => hub.publish(rootId, chunk),
          syncEnded: (end) => dispatcher.deliverSyncEnd(end),
          slotFreed: () => dispatcher.slotFreed(),
        },
      },
    });
    dispatcher.attach(run.pool(), run.pool().summary.handlers);
    const cleanUp = (): void => {
      rows.deleteFinishedBefore(clock.now() - settings.retentionDays * dayMs);
      retention = clock.setTimer(hourMs, cleanUp);
    };
    cleanUp();
    dispatcher.interruptLeftovers();
    dispatcher.wake();
    dispatcher.deliverAlong((deliverIn) => workspaces.openHomeFirstTime((workspaceId) => deliverIn('kernel.workspace.opened', { workspaceId }, workspaceId)));
    const startWorkspace = dispatcher.deliverAlong((deliverIn) =>
      workspaces.open(options.startFolder, (workspaceId) => deliverIn('kernel.workspace.opened', { workspaceId }, workspaceId)),
    );
    const started = run.pool().summary.handlers.filter((handler) => handler.point === 'kernel.started').map((handler) => handler.extension);
    await runStartedHandlers(dispatcher, logger, run.extensions().map((extension) => extension.name), started);
    watcher = watchExtensions(run.folders(), logger, (changed) => reloadExtensions(run, dispatcher, logger, changed, stopping.signal));
    const activeWatcher = watcher;
    return {
      exec: async (name, input, { caller, workspaceId, jobId }) =>
        run.pool().run({ id: jobId ?? ids(), name, input, workspace: workspace(workspaceId), caller, async: false, fromHandler: false }),
      execAsync: async (name, input, { caller, workspaceId }) => {
        const { retries } = queuableCommand(run.pool().summary, name, caller);
        workspace(workspaceId);
        return dispatcher.queue({ name, input, workspaceId, caller, retries, fromHandler: false, runAt: clock.now() });
      },
      cancel: (jobId) => dispatcher.cancel(jobId),
      waitForJob: (jobId) => dispatcher.waitForJob(jobId),
      watchProgress: (jobId, listener) => hub.watch(jobId, listener),
      catalog: (language) => run.catalogs().catalog(language),
      web: createKernelWeb({ connection, run, files: createFiles({ connection, home: options.home, ids, clock }), settings: settings.settings, ids, workspace, logger }),
      startWorkspace,
      settled: () => dispatcher.settled(),
      close: async () => {
        stopping.abort();
        await activeWatcher.close();
        await stopRun(dispatcher, run, processes);
        closeStorage();
      },
    };
  } catch (error) {
    await watcher?.close();
    closeStorage();
    throw error;
  }
}
