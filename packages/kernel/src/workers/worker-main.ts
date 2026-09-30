import { parentPort, workerData } from 'node:worker_threads';
import { ProblemError, type Problem } from '@kvman/sdk';
import { systemClock } from '../clock.ts';
import { createExtensionCtx, type WorkerServices } from '../ctx/extension-ctx.ts';
import { createFiles } from '../files/files.ts';
import { handlerSummaries } from '../jobs/handlers.ts';
import { createIdGenerator } from '../ids.ts';
import { createRegistry } from '../jobs/registry.ts';
import { registerKernelApi } from '../kernel-api/register-kernel-api.ts';
import { openLogFile } from '../logging/log-file.ts';
import { kernelProblem } from '../problems.ts';
import { openSecretsFile } from '../secrets/secrets-file.ts';
import { kernelSettingDefinitions } from '../settings/kernel-settings.ts';
import { checkPresetSettings } from '../settings/preset-check.ts';
import { createSettings } from '../settings/settings.ts';
import { openConnection } from '../storage/database.ts';
import { answerFromMain, createRootRunner } from './root-runner.ts';
import { shareKernelSdk } from './sdk-resolution.ts';
import { toWorkerSchema, workerSetupSchema, type ToMain, type WorkerExtension, type WorkerRequest } from './protocol.ts';

// A worker thread: it loads every extension of the run, then runs the jobs the main thread sends it (plan 02 §2.2).

shareKernelSdk();

if (parentPort === null) throw new Error('worker-main runs only as a worker thread');
const port = parentPort;
const setup = workerSetupSchema.parse(workerData);
const send = (message: ToMain): void => port.postMessage(message);

const logFile = openLogFile(setup.home, setup.logLevel);
const registry = createRegistry();
for (const definition of kernelSettingDefinitions(setup.languages)) registry.settings.set(definition.key, definition);
const answers = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
let nextRequest = 0;

const connection = openConnection(setup.database);
const ids = createIdGenerator(systemClock);
const services: WorkerServices = {
  environment: { registry, logger: logFile.logger, reportSyncEnd: (end) => send({ kind: 'sync-ended', end }) },
  ids,
  request: (request: WorkerRequest) =>
    new Promise((resolve, reject) => {
      nextRequest += 1;
      answers.set(nextRequest, { resolve, reject });
      send({ kind: 'request', requestId: nextRequest, request });
    }),
  home: setup.home,
  connection,
  files: createFiles({ connection, home: setup.home, ids, clock: systemClock }),
  logger: logFile.logger,
  settings: createSettings({ connection, definitions: registry.settings, presetValues: setup.presetSettings, logger: logFile.logger }),
  secrets: openSecretsFile(setup.home),
  sendProgress: (rootId, chunk) => send({ kind: 'progress', rootId, chunk }),
};
const roots = createRootRunner(services.environment, send);

// The worker closes its own connection and log before it exits, so SQLite never sees a thread torn down under it.
function stop(): void {
  connection.close();
  logFile.close();
  process.exit(0);
}

function isEntry(value: unknown): value is (ctx: unknown) => void {
  return typeof value === 'function';
}

async function loadExtension(extension: WorkerExtension): Promise<void> {
  const module: unknown = await import(extension.entryUrl);
  const entry = typeof module === 'object' && module !== null && 'default' in module ? module.default : undefined;
  if (!isEntry(entry)) throw kernelProblem('EXTENSION_INVALID', `${extension.name}: its entry doesn't default-export a function.`, { extension: extension.name });
  entry(createExtensionCtx({ name: extension.name, namespace: extension.namespace }, services));
}

function loadProblem(extension: WorkerExtension, error: unknown): Problem {
  if (error instanceof ProblemError && error.problem.code === 'EXTENSION_INVALID') return error.problem;
  const reason = error instanceof Error ? error.message : String(error);
  return { code: 'EXTENSION_INVALID', message: `${extension.name}: its entry failed (${reason}).`, params: { extension: extension.name } };
}

async function load(): Promise<void> {
  const { homeFolder, extensions } = setup;
  registerKernelApi(registry, { ...services, homeFolder, registry, extensions });
  for (const extension of setup.extensions) {
    try {
      await loadExtension(extension);
    } catch (error) {
      send({ kind: 'failed', problem: loadProblem(extension, error) });
      return;
    }
  }
  registry.sealed = true;
  if (setup.checkPresetSettings) {
    try {
      checkPresetSettings(registry.settings, setup.presetSettings);
    } catch (error) {
      if (!(error instanceof ProblemError)) throw error;
      send({ kind: 'failed', problem: error.problem });
      return;
    }
  }
  const jobs = [...registry.jobs.values()].map((job) => ({ name: job.name, kind: job.kind, owner: job.owner, public: job.public, retries: job.retries, syncOnly: job.syncOnly }));
  send({ kind: 'ready', summary: { jobs, handlers: handlerSummaries(registry) } });
}

port.on('message', (raw: unknown) => {
  const message = toWorkerSchema.parse(raw);
  if (message.kind === 'run') roots.run(message.requestId, message.job);
  else if (message.kind === 'abort') roots.abort(message.requestId, message.reason);
  else if (message.kind === 'answer') answerFromMain(answers, message);
  else stop();
});

await load();
