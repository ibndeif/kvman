import { jsonSchema, kernelCommandSchemas, kernelQuerySchemas } from '@kvman/sdk';
import { requireJob } from '../jobs/current-job.ts';
import { validationFailed } from '../store/json-values.ts';
import { jsonSchemaOf } from './json-schemas.ts';
import type { KernelApiServices } from './kernel-api-services.ts';
import type { KernelRegistrations } from './kernel-registrations.ts';

// `kernel.settings.*` (plan 02 §2.8): the user sets any key, in the call's workspace for the workspace scope.
export function registerSettingsApi(api: KernelRegistrations, { registry, settings }: KernelApiServices): void {
  api.command('kernel.settings.set', kernelCommandSchemas['kernel.settings.set'], 'Sets a setting.', (input) => {
    settings.set(input.key, input.value, input.scope, requireJob('kernel.settings.set').workspace.id);
    return {};
  });
  api.command('kernel.settings.reset', kernelCommandSchemas['kernel.settings.reset'], "Removes a setting's value in one scope.", (input) => {
    settings.reset(input.key, input.scope, requireJob('kernel.settings.reset').workspace.id);
    return {};
  });
  api.query('kernel.settings.list', kernelQuerySchemas['kernel.settings.list'], 'Lists every setting with its value.', () => {
    const workspaceId = requireJob('kernel.settings.list').workspace.id;
    return [...registry.settings.values()].map((definition) => {
      const resolved = settings.resolve(definition.key, workspaceId);
      const value = jsonSchema.safeParse(resolved.value);
      if (!value.success) throw validationFailed(`The value of "${definition.key}"`, value.error);
      return {
        key: definition.key,
        description: definition.description,
        schema: jsonSchemaOf(definition.schema, 'input'),
        scopes: [...definition.scopes],
        value: value.data,
        source: resolved.source,
      };
    });
  });
}
