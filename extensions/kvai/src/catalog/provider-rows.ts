import type { Ctx } from '@kvman/sdk';
import { splitModelId, type ProviderConnection, type ProviderRow, type ProviderStatus } from '../schemas/catalog.ts';
import { builtinCatalog, builtinModel, builtinModels } from './builtin-catalog.ts';
import type { CustomCatalog } from './custom-catalog.ts';

// The providers as the Models page shows them (plan 07 §7.2–§7.3, ADR 0009, 79, 229): how each is connected, and how
// many models it has. A provider holds one credential: the secret `<provider>.apiKey` or `<provider>.oauth`, and the
// last one connected wins (ADR 0009, 228).

export function keySecretName(provider: string): string {
  return `${provider}.apiKey`;
}

export function oauthSecretName(provider: string): string {
  return `${provider}.oauth`;
}

async function connectionOf(ctx: Ctx, provider: string): Promise<ProviderConnection> {
  if ((await ctx.secrets.get(oauthSecretName(provider))) !== undefined) return 'oauth';
  if ((await ctx.secrets.get(keySecretName(provider))) !== undefined) return 'apiKey';
  return null;
}

function statusOf(connection: ProviderConnection, builtIn: boolean): ProviderStatus {
  if (connection !== null) return 'ready';
  return builtIn ? 'needsKey' : 'noKey';
}

// Whether the provider offers a plan sign-in and takes an API key, from pi-ai's own auth (ADR 0009, 227, 229).
// A provider unknown to pi-ai is custom: no sign-in, and it takes a key.
async function flagsOf(id: string): Promise<{ signIn: boolean; apiKey: boolean }> {
  const auth = (await builtinCatalog()).getProvider(id)?.auth;
  if (auth === undefined) return { signIn: false, apiKey: true };
  return { signIn: auth.oauth !== undefined, apiKey: auth.apiKey !== undefined };
}

export async function providerRows(ctx: Ctx, catalog: CustomCatalog): Promise<ProviderRow[]> {
  const builtIn = await Promise.all(
    (await builtinCatalog()).getProviders().map(async (provider) => {
      const connection = await connectionOf(ctx, provider.id);
      const flags = await flagsOf(provider.id);
      return {
        id: provider.id,
        title: provider.name,
        builtIn: true,
        status: statusOf(connection, true),
        models: (await builtinModels(provider.id)).length,
        connection,
        ...flags,
      };
    }),
  );
  const customModels = await catalog.models();
  const custom = await Promise.all(
    (await catalog.providers()).map(async (provider) => {
      const connection = await connectionOf(ctx, provider.providerId);
      return {
        id: provider.providerId,
        title: provider.title,
        builtIn: false,
        status: statusOf(connection, false),
        models: customModels.filter((model) => model.provider === provider.providerId).length,
        connection,
        signIn: false,
        apiKey: true,
      };
    }),
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
