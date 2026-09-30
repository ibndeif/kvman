import type { Model, Api } from '@earendil-works/pi-ai';
import { z, type Ctx } from '@kvman/sdk';
import { builtinCatalog, builtinModel, builtinModels } from './catalog/builtin-catalog.ts';
import type { CustomCatalog } from './catalog/custom-catalog.ts';
import {
  modelAddSchema,
  modelRowSchema,
  providerAddSchema,
  providerRowSchema,
  splitModelId,
  type ModelRow,
  type StoredModel,
} from './schemas/catalog.ts';

// The provider and model admin API (plan 07 §7.2, ADR 0009, 52–57). Built-ins come from pi-ai and can't be added,
// replaced, or removed (`kvai/BUILT_IN`); custom ones live in kvai's global store.

const empty = z.object({});

function builtinRow(model: Model<Api>): ModelRow {
  const { input, output, cacheRead, cacheWrite } = model.cost;
  const base = { name: model.name, provider: model.provider, reasoning: model.reasoning, input: model.input };
  return { id: `${model.provider}/${model.id}`, ...base, contextWindow: model.contextWindow, maxTokens: model.maxTokens, cost: { input, output, cacheRead, cacheWrite }, builtIn: true };
}

function customRow(model: StoredModel): ModelRow {
  const { provider, modelId, name, reasoning, input, contextWindow, maxTokens, cost } = model;
  return { id: `${provider}/${modelId}`, name, provider, reasoning, input, contextWindow, maxTokens, cost, builtIn: false };
}

function registerProviders(ctx: Ctx, catalog: CustomCatalog): void {
  const keyState = async (providerId: string): Promise<'set' | 'missing'> => ((await ctx.secrets.get(`${providerId}.apiKey`)) === undefined ? 'missing' : 'set');
  ctx.registerQuery('kvai.provider.list', {
    description: 'Lists the built-in and custom providers, with whether each key is set.',
    input: empty,
    output: z.array(providerRowSchema),
    public: true,
    handle: async () => {
      const builtIn = (await builtinCatalog()).getProviders().map((provider) => ({ id: provider.id, title: provider.name, builtIn: true }));
      const custom = (await catalog.providers()).map((provider) => ({ id: provider.providerId, title: provider.title, builtIn: false }));
      return Promise.all([...builtIn, ...custom].map(async (provider) => ({ ...provider, key: await keyState(provider.id) })));
    },
  });
  ctx.registerCommand('kvai.provider.add', {
    description: 'Adds or replaces a custom provider, called over a wire API or through a delegate command.',
    input: providerAddSchema,
    output: empty,
    public: true,
    handle: async (input) => {
      if ((await builtinCatalog()).getProvider(input.id) !== undefined) throw ctx.problem('kvai/BUILT_IN', { id: input.id });
      const { id, ...rest } = input;
      await catalog.putProvider({ providerId: id, ...rest });
      return {};
    },
  });
  ctx.registerCommand('kvai.provider.remove', {
    description: 'Removes a custom provider and its models.',
    input: z.object({ id: z.string().min(1) }),
    output: empty,
    public: true,
    handle: async (input) => {
      if ((await builtinCatalog()).getProvider(input.id) !== undefined) throw ctx.problem('kvai/BUILT_IN', { id: input.id });
      await catalog.removeProvider(input.id);
      return {};
    },
  });
}

function registerModels(ctx: Ctx, catalog: CustomCatalog): void {
  ctx.registerQuery('kvai.model.list', {
    description: 'Lists the built-in and custom models, of one provider or of all.',
    input: z.object({ provider: z.string().min(1).exactOptional() }),
    output: z.array(modelRowSchema),
    public: true,
    handle: async (input) => {
      const builtIn = (await builtinModels(input.provider)).map(builtinRow);
      return [...builtIn, ...(await catalog.models(input.provider)).map(customRow)];
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

export function registerCatalog(ctx: Ctx, catalog: CustomCatalog): void {
  registerProviders(ctx, catalog);
  registerModels(ctx, catalog);
}
