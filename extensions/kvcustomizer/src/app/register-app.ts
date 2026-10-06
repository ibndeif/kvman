import { extensionSourceSchema, installSourceSchema, kernelCommandSchemas, kernelQuerySchemas, packageNameSchema, z, type Ctx } from '@kvman/sdk';
import type {} from '@kvman/kvai';
import { invalid } from '../problems.ts';
import { installSource } from './install-source.ts';

// The `kvman` connector's commands (plan 09 §9.1, ADR 0010, 6 and 8): the model, the settings, the extensions, and the
// preset of the app the agent runs in. Each wraps a kernel command (or kvai's model list) and nothing here reads,
// writes, or lists a secret (CLAUDE.md §6). A change to the extensions or the preset applies at the next start. The
// commands that change the app are registered with kvcoder as ones the person approves first (ADR 0022, 5).

const empty = z.object({});

const callableModelSchema = z.object({ id: z.string(), name: z.string(), provider: z.string(), isDefault: z.boolean() });

const extensionRowSchema = z.object({
  name: z.string(),
  version: z.string(),
  source: extensionSourceSchema,
  namespace: z.string(),
  commands: z.array(z.string()),
  queries: z.array(z.string()),
  settings: z.array(z.string()),
});

const editResultSchema = kernelCommandSchemas['kernel.extensions.install'].output;

// The models that can be called now: those of a provider that is connected, and those of a custom provider.
async function callableModels(ctx: Ctx): Promise<z.output<typeof callableModelSchema>[]> {
  const providers = await ctx.exec('kvai.provider.list', {});
  const callable = new Set(providers.filter((provider) => provider.connection !== null || !provider.builtIn).map((provider) => provider.id));
  const models = await ctx.exec('kvai.model.list', {});
  return models
    .filter((model) => callable.has(model.provider))
    .map((model) => ({ id: model.id, name: model.name, provider: model.provider, isDefault: model.isDefault }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function registerApp(ctx: Ctx): void {
  ctx.registerQuery('kvcustomizer.app.model.list', {
    description: 'Lists the models that can be called now: those of connected providers and of custom providers.',
    public: true,
    input: empty,
    output: z.array(callableModelSchema),
    handle: () => callableModels(ctx),
  });
  ctx.registerCommand('kvcustomizer.app.model.set', {
    description: 'Sets the default model, which must be one that model list shows.',
    public: true,
    retries: 0,
    input: z.object({ model: z.string().min(1).describe('The full model id, such as anthropic/claude-sonnet-5-5.') }),
    output: empty,
    handle: async (input) => {
      if (!(await callableModels(ctx)).some((model) => model.id === input.model)) {
        throw invalid(`${input.model} isn't a model that can be called now; run model list to see the ones that can.`, { model: input.model });
      }
      await ctx.exec('kernel.settings.set', { key: 'kvai.defaultModel', value: input.model, scope: 'global' });
      return {};
    },
  });

  ctx.registerQuery('kvcustomizer.app.settings.list', {
    description: 'Lists every setting with its description, schema, scopes, value, and where the value comes from.',
    public: true,
    input: empty,
    output: kernelQuerySchemas['kernel.settings.list'].output,
    handle: () => ctx.exec('kernel.settings.list', {}),
  });
  ctx.registerCommand('kvcustomizer.app.settings.set', {
    description: 'Sets a setting, globally or for this workspace.',
    public: true,
    retries: 0,
    input: kernelCommandSchemas['kernel.settings.set'].input,
    output: empty,
    handle: (input) => ctx.exec('kernel.settings.set', input),
  });
  ctx.registerCommand('kvcustomizer.app.settings.reset', {
    description: 'Resets a setting to the value it would have without this scope.',
    public: true,
    retries: 0,
    input: kernelCommandSchemas['kernel.settings.reset'].input,
    output: empty,
    handle: (input) => ctx.exec('kernel.settings.reset', input),
  });

  ctx.registerQuery('kvcustomizer.app.extensions.list', {
    description: 'Lists the extensions that run now, with their version, source, and the names they register.',
    public: true,
    input: empty,
    output: z.array(extensionRowSchema),
    handle: async () =>
      (await ctx.exec('kernel.extensions.list', {})).map((extension) => ({
        name: extension.name,
        version: extension.version,
        source: extension.source,
        namespace: extension.namespace,
        commands: extension.commands.map((command) => command.name),
        queries: extension.queries.map((query) => query.name),
        settings: extension.settings.map((setting) => setting.key),
      })),
  });
  ctx.registerCommand('kvcustomizer.app.extensions.install', {
    description: 'Adds an extension to the preset; it starts at the next start of kvman. A path: folder is a project of the workspace.',
    public: true,
    retries: 0,
    input: z.strictObject({
      source: installSourceSchema.describe('npm:<package name>@<exact version>, path:<a project folder, relative to the workspace folder>, or bundled:<package name> (only for a bundled extension).'),
    }),
    output: editResultSchema,
    handle: (input) => ctx.exec('kernel.extensions.install', { source: installSource(ctx.job.workspace.path, input.source) }),
  });
  ctx.registerCommand('kvcustomizer.app.restart', {
    description: 'Restarts kvman: it stops running work and starts again with the preset as it is stored.',
    public: true,
    retries: 0,
    input: empty,
    output: z.object({ restarting: z.literal(true) }),
    handle: () => ctx.exec('kernel.restart', {}),
  });
  ctx.registerCommand('kvcustomizer.app.extensions.uninstall', {
    description: 'Removes an extension from the preset; it stops at the next start of kvman.',
    public: true,
    retries: 0,
    input: z.object({ name: packageNameSchema.describe('The extension package name.') }),
    output: editResultSchema,
    handle: (input) => ctx.exec('kernel.extensions.uninstall', input),
  });

  ctx.registerQuery('kvcustomizer.app.preset.get', {
    description: 'Gives the preset as stored now: its name, where it came from, its extensions, and its settings.',
    public: true,
    input: empty,
    output: kernelQuerySchemas['kernel.preset.get'].output,
    handle: () => ctx.exec('kernel.preset.get', {}),
  });
}
