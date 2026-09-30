import { z, type Ctx } from '@kvman/sdk';
import { builtinCatalog } from './catalog/builtin-catalog.ts';
import type { CustomCatalog } from './catalog/custom-catalog.ts';
import { keySecretName, providerExists, providerRow, providerRows } from './catalog/provider-rows.ts';
import { providerAddSchema, providerKeySetSchema, providerRowSchema } from './schemas/catalog.ts';

// The provider admin API (plan 07 §7.2, ADR 0009, 52–57, 79). Built-ins come from pi-ai and can't be added, replaced,
// or removed (`kvai/BUILT_IN`); custom ones live in kvai's global store. A key is set only by a sync call, so it never
// lands in a job row (ADR 0009, 80).

const empty = z.object({});
const providerInput = z.object({ provider: z.string().min(1) });

async function knownProvider(ctx: Ctx, catalog: CustomCatalog, provider: string): Promise<void> {
  if (!(await providerExists(catalog, provider))) throw ctx.problem('kvai/PROVIDER_UNKNOWN', { provider });
}

function registerProviderQueries(ctx: Ctx, catalog: CustomCatalog): void {
  ctx.registerQuery('kvai.provider.list', {
    description: 'Lists the built-in and custom providers, with whether each can be called and its model count.',
    input: empty,
    output: z.array(providerRowSchema),
    public: true,
    handle: () => providerRows(ctx, catalog),
  });
  ctx.registerQuery('kvai.provider.get', {
    description: 'Gives one provider, with whether it can be called and its model count.',
    input: z.object({ id: z.string().min(1) }),
    output: providerRowSchema,
    public: true,
    handle: (input) => providerRow(ctx, catalog, input.id),
  });
}

function registerProviderChanges(ctx: Ctx, catalog: CustomCatalog): void {
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

function registerProviderKeys(ctx: Ctx, catalog: CustomCatalog): void {
  ctx.registerCommand('kvai.provider.key.set', {
    description: "Sets a provider's API key.",
    input: providerKeySetSchema,
    output: empty,
    public: true,
    syncOnly: true,
    handle: async (input) => {
      await knownProvider(ctx, catalog, input.provider);
      await ctx.secrets.set(keySecretName(input.provider), input.key);
      return {};
    },
  });
  ctx.registerCommand('kvai.provider.key.delete', {
    description: "Deletes a provider's API key.",
    input: providerInput,
    output: empty,
    public: true,
    handle: async (input) => {
      await knownProvider(ctx, catalog, input.provider);
      await ctx.secrets.delete(keySecretName(input.provider));
      return {};
    },
  });
}

export function registerProviders(ctx: Ctx, catalog: CustomCatalog): void {
  registerProviderQueries(ctx, catalog);
  registerProviderChanges(ctx, catalog);
  registerProviderKeys(ctx, catalog);
}
