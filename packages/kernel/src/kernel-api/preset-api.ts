import { kernelCommandSchemas, kernelQuerySchemas, presetStateSchema } from '@kvman/sdk';
import { validationFailed } from '../store/json-values.ts';
import type { KernelApiServices } from './kernel-api-services.ts';
import type { KernelRegistrations } from './kernel-registrations.ts';

// `kernel.preset.get`, `kernel.extensions.install` and `.uninstall`, `kernel.preset.settings.set` and `.reset`, and
// `kernel.presets.save` (plan 02 §2.10 and §2.12, ADR 0010, 5; ADR 0030, 4 and 5): the handlers run in a worker and ask
// the main thread, which owns the stored preset and makes edits one at a time. An edit only rewrites the preset file; a
// restart applies it. The worker knows the registered settings, so it checks a value against its schema.
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
        await services.request({ kind: 'preset-install', source: input.source }),
      ),
  );
  api.command(
    'kernel.extensions.uninstall',
    kernelCommandSchemas['kernel.extensions.uninstall'],
    'Removes an extension from the preset file; it takes effect at the next start.',
    async (input) =>
      kernelCommandSchemas['kernel.extensions.uninstall'].output.parse(await services.request({ kind: 'preset-uninstall', name: input.name })),
  );
  api.command(
    'kernel.preset.settings.set',
    kernelCommandSchemas['kernel.preset.settings.set'],
    "Sets one value of the preset file's settings; it takes effect at the next start.",
    async (input) => {
      const definition = services.registry.settings.get(input.key);
      const checked = definition?.schema.safeParse(input.value);
      if (checked !== undefined && !checked.success) throw validationFailed(`The value of "${input.key}"`, checked.error);
      return kernelCommandSchemas['kernel.preset.settings.set'].output.parse(
        await services.request({ kind: 'preset-settings-set', key: input.key, value: input.value, registered: definition !== undefined }),
      );
    },
  );
  api.command(
    'kernel.preset.settings.reset',
    kernelCommandSchemas['kernel.preset.settings.reset'],
    "Removes one value from the preset file's settings; it takes effect at the next start.",
    async (input) => {
      const definition = services.registry.settings.get(input.key);
      return kernelCommandSchemas['kernel.preset.settings.reset'].output.parse(
        await services.request({ kind: 'preset-settings-reset', key: input.key, required: definition !== undefined && definition.defaultValue === undefined }),
      );
    },
  );
  api.command(
    'kernel.presets.save',
    kernelCommandSchemas['kernel.presets.save'],
    "Writes a preset to the home's presets, to start later by its name.",
    async (input) =>
      kernelCommandSchemas['kernel.presets.save'].output.parse(
        await services.request({ kind: 'preset-save', preset: input.preset, replace: input.replace === true }),
      ),
  );
}
