import type { Ctx } from '@kvman/sdk';
import { splitModelId, type ProviderRow, type ProviderStatus } from '../schemas/catalog.ts';
import { builtinCatalog, builtinModel, builtinModels } from './builtin-catalog.ts';
import type { CustomCatalog } from './custom-catalog.ts';

// The providers as the Models page shows them (plan 07 §7.2–§7.3, ADR 0009, 79): whether each can be called, and how
// many models it has. A provider's key is kvai's secret `<provider>.apiKey` (ADR 0009, 53).

export function keySecretName(provider: string): string {
  return `${provider}.apiKey`;
}

async function statusOf(ctx: Ctx, provider: string, builtIn: boolean): Promise<ProviderStatus> {
  if ((await ctx.secrets.get(keySecretName(provider))) !== undefined) return 'ready';
  return builtIn ? 'needsKey' : 'noKey';
}

export async function providerRows(ctx: Ctx, catalog: CustomCatalog): Promise<ProviderRow[]> {
  const builtIn = await Promise.all(
    (await builtinCatalog()).getProviders().map(async (provider) => ({
      id: provider.id,
      title: provider.name,
      builtIn: true,
      status: await statusOf(ctx, provider.id, true),
      models: (await builtinModels(provider.id)).length,
    })),
  );
  const customModels = await catalog.models();
  const custom = await Promise.all(
    (await catalog.providers()).map(async (provider) => ({
      id: provider.providerId,
      title: provider.title,
      builtIn: false,
      status: await statusOf(ctx, provider.providerId, false),
      models: customModels.filter((model) => model.provider === provider.providerId).length,
    })),
  );
  return [...builtIn, ...custom];
}

export async function providerRow(ctx: Ctx, catalog: CustomCatalog, id: string): Promise<ProviderRow> {
  const row = (await providerRows(ctx, catalog)).find((provider) => provider.id === id);
  if (row === undefined) throw ctx.problem('kvai/PROVIDER_UNKNOWN', { provider: id });
  return row;
}

export async function providerExists(catalog: CustomCatalog, id: string): Promise<boolean> {
  return (await builtinCatalog()).getProvider(id) !== undefined || (await catalog.provider(id)) !== undefined;
}

// The name of a model by its full id, or `null` when there's no such model.
export async function modelName(catalog: CustomCatalog, fullId: string): Promise<string | null> {
  const parts = splitModelId(fullId);
  if (parts === undefined) return null;
  const model = (await builtinModel(parts.provider, parts.model)) ?? (await catalog.model(parts.provider, parts.model));
  return model?.name ?? null;
}
