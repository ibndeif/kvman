import { jsonSchema, problemCodeSchema, ProblemError, type Ctx, type CurrentJob, type Json, type SettingsAccess, type SettingValueOf } from '@kvman/sdk';
import type { KernelLogger, LogFields } from '../logging/logger.ts';
import { kernelProblem } from '../problems.ts';
import type { SecretsFile } from '../secrets/secrets-file.ts';
import type { Settings } from '../settings/settings.ts';
import type { Connection } from '../storage/database.ts';
import { createStore } from '../store/store.ts';
import { currentJob, requireJob, requireWritable } from '../jobs/current-job.ts';
import { registerJob, registerSetting, type Owner } from '../jobs/registry.ts';
import { registerHandler } from '../jobs/handlers.ts';
import { progressLimitBytes } from '../limits.ts';
import type { WorkerRequest } from '../workers/protocol.ts';
import { jobCalls, type JobCallServices } from './job-calls.ts';

// The `ctx` an extension's entry receives in a worker (plan 03). It grows milestone by milestone until it is the whole
// `Ctx`; the calls not built yet are left out of its type rather than stubbed.

export type ExtensionCtx = Omit<Ctx, 'files' | 'processes' | 'settings'> & { settings: Pick<SettingsAccess, 'get'> };

export type WorkerServices = JobCallServices & {
  connection: Connection;
  logger: KernelLogger;
  settings: Settings;
  secrets: SecretsFile;
  sendProgress: (rootId: string, chunk: { source: string; data: Json }) => void;
};

function logWith(logger: KernelLogger, owner: Owner): Ctx['log'] {
  const tagged = (fields: LogFields | undefined): LogFields => {
    const job = currentJob();
    return job === undefined ? { ...fields, extension: owner.name } : { ...fields, extension: owner.name, jobId: job.id };
  };
  return {
    debug: (message, fields) => logger.debug(message, tagged(fields)),
    info: (message, fields) => logger.info(message, tagged(fields)),
    warn: (message, fields) => logger.warn(message, tagged(fields)),
    error: (message, fields) => logger.error(message, tagged(fields)),
  };
}

function problemFor(owner: Owner, code: string, params: Readonly<Record<string, Json>> | undefined): ProblemError {
  if (!problemCodeSchema.safeParse(code).success || !code.startsWith(`${owner.namespace}/`)) {
    return kernelProblem('VALIDATION_FAILED', `${owner.name}: a problem code is "${owner.namespace}/UPPER_SNAKE", not "${code}".`, { code });
  }
  return new ProblemError(params === undefined ? { code, message: code } : { code, message: code, params: { ...params } });
}

function progressOf(owner: Owner, services: WorkerServices, rootId: string): (data: Json) => void {
  return (data) => {
    if (!jsonSchema.safeParse(data).success) throw kernelProblem('VALIDATION_FAILED', 'A progress chunk must be JSON.');
    if (Buffer.byteLength(JSON.stringify(data)) > progressLimitBytes) {
      throw kernelProblem('TOO_LARGE', `A progress chunk is over ${progressLimitBytes} bytes of JSON.`, { limit: progressLimitBytes });
    }
    services.sendProgress(rootId, { source: owner.name, data });
  };
}

function secretsOf(owner: Owner, services: WorkerServices): Ctx['secrets'] {
  const write = async (call: string, request: WorkerRequest): Promise<void> => {
    requireWritable(requireJob(call), call);
    await services.request(request);
  };
  return {
    get: async (name) => {
      requireJob('ctx.secrets.get');
      return services.secrets.get(owner.name, name);
    },
    set: (name, value) => write('ctx.secrets.set', { kind: 'write-secret', write: { action: 'set', extension: owner.name, name, value } }),
    delete: (name) => write('ctx.secrets.delete', { kind: 'write-secret', write: { action: 'delete', extension: owner.name, name } }),
  };
}

export function createExtensionCtx(owner: Owner, services: WorkerServices): ExtensionCtx {
  const registry = services.environment.registry;
  return {
    registerCommand: (name, registration) => registerJob(registry, owner, 'command', name, registration),
    registerQuery: (name, registration) => registerJob(registry, owner, 'query', name, registration),
    registerSetting: (key, registration) => registerSetting(registry, owner, key, registration),
    registerHandler: (point, registration) => registerHandler(registry, owner, point, registration),
    ...jobCalls(owner, services),
    problem: (code, params) => problemFor(owner, code, params),
    get job(): CurrentJob {
      const job = requireJob('ctx.job');
      return { id: job.id, rootId: job.rootId, workspace: job.workspace, caller: job.caller, signal: job.signal, progress: progressOf(owner, services, job.rootId) };
    },
    get store() {
      const job = requireJob('ctx.store');
      return createStore(services.connection, { extension: owner.name, workspaceId: job.workspace.id }, services.ids, () => requireWritable(job, 'A store write'));
    },
    settings: {
      // The kernel checked the value against the key's schema; the declared type is the key owner's promise.
      get: async <Key extends string>(key: Key) => services.settings.resolve(key, requireJob('ctx.settings.get').workspace.id).value as SettingValueOf<Key>,
    },
    secrets: secretsOf(owner, services),
    log: logWith(services.logger, owner),
  };
}
