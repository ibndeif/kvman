import { kernelCommandSchemas, kernelQuerySchemas } from '@kvman/sdk';
import { kernelProblem } from '../problems.ts';
import type { KernelApiServices } from './kernel-api-services.ts';
import type { KernelRegistrations } from './kernel-registrations.ts';

// `kernel.secrets.*` (plan 02 §2.8, ADR 0009, 29): names only ever leave; `set` runs only as a sync call, so a value
// never lands in a job row. The main thread writes `secrets.json`.
export function registerSecretsApi(api: KernelRegistrations, services: KernelApiServices): void {
  const inRun = (extension: string): void => {
    if (!services.extensions.some((entry) => entry.name === extension)) {
      throw kernelProblem('NOT_FOUND', `There is no extension ${extension} in this run.`, { extension });
    }
  };
  api.command(
    'kernel.secrets.set',
    kernelCommandSchemas['kernel.secrets.set'],
    "Sets an extension's secret.",
    async (input) => {
      inRun(input.extension);
      await services.request({ kind: 'write-secret', write: { action: 'set', extension: input.extension, name: input.name, value: input.value } });
      return {};
    },
    { syncOnly: true },
  );
  api.command('kernel.secrets.delete', kernelCommandSchemas['kernel.secrets.delete'], "Deletes an extension's secret.", async (input) => {
    inRun(input.extension);
    await services.request({ kind: 'write-secret', write: { action: 'delete', extension: input.extension, name: input.name } });
    return {};
  });
  api.query('kernel.secrets.list', kernelQuerySchemas['kernel.secrets.list'], 'Lists the secrets by name, never their values.', () => services.secrets.list());
}
