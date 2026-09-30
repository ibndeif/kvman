import { problemCodeSchema, ProblemError, type Ctx, type CurrentJob, type Json, type OutputOf, type SettingsAccess, type SettingValueOf } from '@kvman/sdk';
import type { IdGenerator } from '../ids.ts';
import type { KernelLogger, LogFields } from '../logging/logger.ts';
import { kernelProblem } from '../problems.ts';
import type { SecretsFile } from '../secrets/secrets-file.ts';
import type { Settings } from '../settings/settings.ts';
import type { Connection } from '../storage/database.ts';
import { createStore } from '../store/store.ts';
import { currentJob, requireJob, requireWritable } from '../jobs/current-job.ts';
import { registerJob, registerSetting, type Owner, type Registry } from '../jobs/registry.ts';
import { runJob } from '../jobs/run-job.ts';
import type { SecretWrite } from '../workers/protocol.ts';

// The `ctx` an extension's entry receives in a worker (plan 03). It grows milestone by milestone until it is the whole
// `Ctx`; the calls not built yet are left out of its type rather than stubbed.

export type ExtensionCtx = Omit<Ctx, 'registerHandler' | 'execAsync' | 'schedule' | 'cancel' | 'files' | 'processes' | 'settings'> & {
  settings: Pick<SettingsAccess, 'get'>;
};


export type WorkerServices = {
  connection: Connection;
  ids: IdGenerator;
  registry: Registry;
  logger: KernelLogger;
  settings: Settings;
  secrets: SecretsFile;
  writeSecret: (write: SecretWrite) => Promise<void>;
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

export function createExtensionCtx(owner: Owner, services: WorkerServices): ExtensionCtx {
  const { registry, logger } = services;
  return {
    registerCommand: (name, registration) => registerJob(registry, owner, 'command', name, registration),
    registerQuery: (name, registration) => registerJob(registry, owner, 'query', name, registration),
    registerSetting: (key, registration) => registerSetting(registry, owner, key, registration),
    exec: async <Name extends string>(name: Name, input: unknown) => {
      const parent = requireJob('ctx.exec');
      const request = { id: services.ids(), rootId: parent.rootId, name, input, workspace: parent.workspace, parent, signal: parent.signal };
      const output = await runJob(registry, logger, { ...request, caller: { kind: 'extension', name: owner.name } });
      // The kernel checked the output against the registered schema; the declared type is the callee's promise.
      return output as OutputOf<Name>;
    },
    problem: (code, params) => problemFor(owner, code, params),
    get job(): CurrentJob {
      const job = requireJob('ctx.job');
      return { id: job.id, rootId: job.rootId, workspace: job.workspace, caller: job.caller, signal: job.signal, progress: () => undefined };
    },
    get store() {
      const job = requireJob('ctx.store');
      return createStore(services.connection, { extension: owner.name, workspaceId: job.workspace.id }, services.ids, () => requireWritable(job, 'A store write'));
    },
    settings: {
      // The kernel checked the value against the key's schema; the declared type is the key owner's promise.
      get: async <Key extends string>(key: Key) => services.settings.resolve(key, requireJob('ctx.settings.get').workspace.id).value as SettingValueOf<Key>,
    },
    secrets: {
      get: async (name) => {
        requireJob('ctx.secrets.get');
        return services.secrets.get(owner.name, name);
      },
      set: async (name, value) => {
        requireWritable(requireJob('ctx.secrets.set'), 'ctx.secrets.set');
        await services.writeSecret({ action: 'set', extension: owner.name, name, value });
      },
      delete: async (name) => {
        requireWritable(requireJob('ctx.secrets.delete'), 'ctx.secrets.delete');
        await services.writeSecret({ action: 'delete', extension: owner.name, name });
      },
    },
    log: logWith(logger, owner),
  };
}
