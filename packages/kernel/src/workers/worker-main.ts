import { parentPort, workerData } from 'node:worker_threads';
import { ProblemError, type Problem } from '@kvman/sdk';
import { systemClock } from '../clock.ts';
import { createExtensionCtx, type WorkerServices } from '../ctx/extension-ctx.ts';
import { createIdGenerator } from '../ids.ts';
import { createRegistry } from '../jobs/registry.ts';
import { runJob } from '../jobs/run-job.ts';
import { openLogFile } from '../logging/log-file.ts';
import { kernelProblem } from '../problems.ts';
import { openSecretsFile } from '../secrets/secrets-file.ts';
import { kernelSettingDefinitions } from '../settings/kernel-settings.ts';
import { checkPresetSettings } from '../settings/preset-check.ts';
import { createSettings } from '../settings/settings.ts';
import { openConnection } from '../storage/database.ts';
import { shareKernelSdk } from './sdk-resolution.ts';
import { toWorkerSchema, workerSetupSchema, type RootJob, type SecretWrite, type ToMain, type WorkerExtension } from './protocol.ts';

// A worker thread: it loads every extension of the run, then runs the jobs the main thread sends it (plan 02 §2.2).

shareKernelSdk();

if (parentPort === null) throw new Error('worker-main runs only as a worker thread');
const port = parentPort;
const setup = workerSetupSchema.parse(workerData);
const send = (message: ToMain): void => port.postMessage(message);

const logFile = openLogFile(setup.home, setup.logLevel);
const registry = createRegistry();
for (const definition of kernelSettingDefinitions()) registry.settings.set(definition.key, definition);
const secretWrites = new Map<number, { resolve: () => void; reject: (error: Error) => void }>();
let nextSecretWrite = 0;

const connection = openConnection(setup.database);
const services: WorkerServices = {
  connection,
  ids: createIdGenerator(systemClock),
  registry,
  logger: logFile.logger,
  settings: createSettings({ connection, definitions: registry.settings, presetValues: setup.presetSettings, logger: logFile.logger }),
  secrets: openSecretsFile(setup.home),
  writeSecret: (write: SecretWrite) =>
    new Promise<void>((resolve, reject) => {
      nextSecretWrite += 1;
      secretWrites.set(nextSecretWrite, { resolve, reject });
      send({ kind: 'write-secret', requestId: nextSecretWrite, write });
    }),
};

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
  send({ kind: 'ready' });
}

async function runRoot(requestId: number, job: RootJob): Promise<void> {
  const request = { ...job, rootId: job.id, parent: undefined, signal: new AbortController().signal };
  try {
    send({ kind: 'result', requestId, output: await runJob(registry, services.logger, request) });
  } catch (error) {
    if (!(error instanceof ProblemError)) throw error;
    send({ kind: 'problem', requestId, problem: error.problem });
  }
}

port.on('message', (raw: unknown) => {
  const message = toWorkerSchema.parse(raw);
  if (message.kind === 'run') {
    void runRoot(message.requestId, message.job);
    return;
  }
  const pending = secretWrites.get(message.requestId);
  secretWrites.delete(message.requestId);
  if (message.problem === undefined) pending?.resolve();
  else pending?.reject(new ProblemError(message.problem));
});

await load();
