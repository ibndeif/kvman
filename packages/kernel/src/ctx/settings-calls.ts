import { jsonSchema, z, type Ctx, type SettingValueOf } from '@kvman/sdk';
import { requireJob, requireWritable } from '../jobs/current-job.ts';
import type { Owner, Registry } from '../jobs/registry.ts';
import { kernelProblem } from '../problems.ts';
import type { Settings } from '../settings/settings.ts';
import { validationFailed } from '../store/json-values.ts';

// `ctx.settings` (plan 02 §2.8, ADR 0009, 24): any key is read in the job's workspace; only the extension's own keys are
// written, in a scope the key allows.

const scopeSchema = z.enum(['global', 'workspace']);

export function settingsCalls(owner: Owner, registry: Registry, settings: Settings): Ctx['settings'] {
  return {
    // The kernel checked the value against the key's schema; the declared type is the key owner's promise.
    get: async <Key extends string>(key: Key) => settings.resolve(key, requireJob('ctx.settings.get').workspace.id).value as SettingValueOf<Key>,
    set: async (key, value, options) => {
      const job = requireJob('ctx.settings.set');
      requireWritable(job, 'ctx.settings.set');
      const definition = registry.settings.get(key);
      if (definition === undefined) throw kernelProblem('NOT_FOUND', `There is no setting "${key}".`, { key });
      if (definition.extension !== owner.name) throw kernelProblem('NOT_PUBLIC', `The setting "${key}" belongs to ${definition.extension}.`, { key });
      const json = jsonSchema.safeParse(value);
      if (!json.success) throw validationFailed(`The value of "${key}"`, json.error);
      const scope = scopeSchema.safeParse(options.scope);
      if (!scope.success) throw validationFailed(`The scope of "${key}"`, scope.error);
      settings.set(key, json.data, scope.data, job.workspace.id);
    },
  };
}
