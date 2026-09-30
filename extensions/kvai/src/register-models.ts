import type { Model, Api } from '@earendil-works/pi-ai';
import { z, type Ctx } from '@kvman/sdk';
import { builtinCatalog, builtinModel, builtinModels } from './catalog/builtin-catalog.ts';
import type { CustomCatalog } from './catalog/custom-catalog.ts';
import { keySecretName, modelName } from './catalog/provider-rows.ts';
import { defaultModelSchema, modelAddSchema, modelRowSchema, splitModelId, type ModelRow, type StoredModel } from './schemas/catalog.ts';

// The model admin API and the default model (plan 07 §7.2, ADR 0009, 54–55, 79). Built-in models come from pi-ai and
// can't be added, replaced, or removed (`kvai/BUILT_IN`); custom ones live in kvai's global store.

const empty = z.object({});

function builtinRow(model: Model<Api>): ModelRow {
  const { input, output, cacheRead, cacheWrite } = model.cost;
  const base = { name: model.name, provider: model.provider, reasoning: model.reasoning, input: model.input };
  return { id: `${model.provider}/${model.id}`, ...base, contextWindow: model.contextWindow, maxTokens: model.maxTokens, cost: { input, output, cacheRead, cacheWrite }, builtIn: true, isDefault: false };
}

function customRow(model: StoredModel): ModelRow {
  const { provider, modelId, name, reasoning, input, contextWindow, maxTokens, cost } = model;
  return { id: `${provider}/${modelId}`, name, provider, reasoning, input, contextWindow, maxTokens, cost, builtIn: false, isDefault: false };
}

function registerModelCatalog(ctx: Ctx, catalog: CustomCatalog): void {
  ctx.registerQuery('kvai.model.list', {
    description: 'Lists the built-in and custom models, of one provider or of all.',
    input: z.object({ provider: z.string().min(1).exactOptional() }),
    output: z.array(modelRowSchema),
    public: true,
    handle: async (input) => {
      const defaultId = await ctx.settings.get('kvai.defaultModel');
      const rows = [...(await builtinModels(input.provider)).map(builtinRow), ...(await catalog.models(input.provider)).map(customRow)];
      return rows.map((row) => ({ ...row, isDefault: row.id === defaultId }));
    },
  });
  ctx.registerCommand('kvai.model.add', {
    description: 'Adds or replaces a model of a custom provider.',
    input: modelAddSchema,
    output: empty,
    public: true,
    handle: async (input) => {
      if ((await builtinCatalog()).getProvider(input.provider) !== undefined) throw ctx.problem('kvai/BUILT_IN', { id: input.provider });
      if ((await catalog.provider(input.provider)) === undefined) throw ctx.problem('kvai/PROVIDER_UNKNOWN', { provider: input.provider });
      const { id, cost, ...rest } = input;
      await catalog.putModel({ ...rest, modelId: id, cost: cost ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } });
      return {};
    },
  });
  ctx.registerCommand('kvai.model.remove', {
    description: 'Removes a custom model.',
    input: z.object({ id: z.string().min(1) }),
    output: empty,
    public: true,
    handle: async (input) => {
      const parts = splitModelId(input.id);
      if (parts === undefined) return {};
      if ((await builtinModel(parts.provider, parts.model)) !== undefined) throw ctx.problem('kvai/BUILT_IN', { id: input.id });
      await catalog.removeModel(parts.provider, parts.model);
      return {};
    },
  });
}

// Whether the default model can be called: it exists, and its provider has a key or needs none.
async function defaultModel(ctx: Ctx, catalog: CustomCatalog): Promise<z.output<typeof defaultModelSchema>> {
  const id = await ctx.settings.get('kvai.defaultModel');
  if (id === null) return { id: null, name: null, ready: false };
  const name = await modelName(catalog, id);
  const provider = splitModelId(id)?.provider;
  if (name === null || provider === undefined) return { id, name, ready: false };
  const custom = (await catalog.provider(provider)) !== undefined;
  return { id, name, ready: custom || (await ctx.secrets.get(keySecretName(provider))) !== undefined };
}

export function registerModels(ctx: Ctx, catalog: CustomCatalog): void {
  registerModelCatalog(ctx, catalog);
  ctx.registerQuery('kvai.model.default.get', {
    description: 'Gives the default model, its name, and whether it can be called.',
    input: empty,
    output: defaultModelSchema,
    public: true,
    handle: () => defaultModel(ctx, catalog),
  });
}
