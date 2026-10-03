import { kernelCommandSchemas, kernelQuerySchemas, presetStateSchema } from '@kvman/sdk';
import type { KernelApiServices } from './kernel-api-services.ts';
import type { KernelRegistrations } from './kernel-registrations.ts';

// `kernel.preset.get`, `kernel.extensions.install`, and `kernel.extensions.uninstall` (plan 02 §2.10 and §2.12,
// ADR 0010, 5): the handlers run in a worker and ask the main thread, which owns the stored preset and makes edits
// one at a time. An edit only rewrites the preset file; a restart applies it.
export function registerPresetApi(api: KernelRegistrations, services: KernelApiServices): void {
  api.query('kernel.preset.get', kernelQuerySchemas['kernel.preset.get'], 'Shows the running preset as stored now.', async () =>
    presetStateSchema.parse(await services.request({ kind: 'preset-get' })),
  );
  api.command(
    'kernel.extensions.install',
    kernelCommandSchemas['kernel.extensions.install'],
    'Adds an extension to the preset file; it takes effect at the next start.',
    async (input) =>
      kernelCommandSchemas['kernel.extensions.install'].output.parse(
        await services.request({ kind: 'preset-install', name: input.name, source: input.source }),
      ),
  );
  api.command(
    'kernel.extensions.uninstall',
    kernelCommandSchemas['kernel.extensions.uninstall'],
    'Removes an extension from the preset file; it takes effect at the next start.',
    async (input) =>
      kernelCommandSchemas['kernel.extensions.uninstall'].output.parse(await services.request({ kind: 'preset-uninstall', name: input.name })),
  );
}
