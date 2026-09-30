import { kernelQuerySchemas } from '@kvman/sdk';
import type { Registry } from '../jobs/registry.ts';
import type { WorkerExtension } from '../workers/protocol.ts';
import { jsonSchemaOf } from './json-schemas.ts';
import type { KernelApiServices } from './kernel-api-services.ts';
import type { KernelRegistrations } from './kernel-registrations.ts';

// `kernel.extensions.list` (plan 02 §2.12, ADR 0009, 28): the run's extensions, not the kernel, with everything they
// register, private names too.

function describe(registry: Registry, extension: WorkerExtension) {
  const jobs = [...registry.jobs.values()].filter((job) => job.owner === extension.name);
  const info = (kind: 'command' | 'query') =>
    jobs
      .filter((job) => job.kind === kind)
      .map((job) => ({ name: job.name, description: job.description, public: job.public, input: jsonSchemaOf(job.input, 'input'), output: jsonSchemaOf(job.output, 'output') }));
  return {
    name: extension.name,
    version: extension.version,
    source: extension.source,
    revision: extension.revision,
    namespace: extension.namespace,
    commands: info('command'),
    queries: info('query'),
    settings: [...registry.settings.values()]
      .filter((setting) => setting.extension === extension.name)
      .map((setting) => ({ key: setting.key, description: setting.description, scopes: [...setting.scopes] })),
    handlers: registry.handlers.filter((handler) => handler.owner === extension.name).map((handler) => ({ point: handler.point, description: handler.description })),
  };
}

export function registerExtensionsApi(api: KernelRegistrations, { registry, extensions }: KernelApiServices): void {
  api.query('kernel.extensions.list', kernelQuerySchemas['kernel.extensions.list'], 'Lists the extensions of this run and what they register.', () =>
    extensions.map((extension) => describe(registry, extension)),
  );
}
