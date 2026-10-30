import type { Api, AuthContext, CredentialStore, Model, Models } from '@earendil-works/pi-ai';
import type { Ctx } from '@kvman/sdk';
import { liveModels } from './live-catalog.ts';

// pi-ai's built-in providers and models (plan 07 §7.2, ADR 0009, 52). The catalog is large, so each worker loads it at
// its first use rather than when kvai loads. pi-ai never refreshes it; pi.dev's live lists join it here (ADR 0110),
// a live model replacing the built-in one with the same id. A model whose price
// varies is left out: one with a negative rate, and OpenRouter's routers, which pi-ai prices at 0 (ADR 0009, 65; ADR 0083, 3;
// ADR 0109, 2). Its free-models router stays: it costs nothing.

let loading: Promise<Models> | undefined;
let credentials: CredentialStore | undefined;

// Environment variables and ambient credential files are never read (ADR 0003, 3).
const noAmbientAuth: AuthContext = { env: () => Promise.resolve(undefined), fileExists: () => Promise.resolve(false) };

/** Gives the catalog the store of plan sign-ins (ADR 0009, 227); kvai calls it once when it loads. */
export function useCredentials(store: CredentialStore): void {
  credentials = store;
  loading = undefined;
}

export function builtinCatalog(): Promise<Models> {
  loading ??= import('@earendil-works/pi-ai/providers/all').then((all) => all.builtinModels({ authContext: noAmbientAuth, ...(credentials === undefined ? {} : { credentials }) }));
  return loading;
}

const routerModels = new Set(['openrouter/openrouter/auto', 'openrouter/openrouter/auto-beta', 'openrouter/openrouter/fusion', 'openrouter/openrouter/pareto-code', 'openrouter/typesafe/jev-router']);

function priced(model: Model<Api>): boolean {
  const { input, output, cacheRead, cacheWrite } = model.cost;
  return !routerModels.has(`${model.provider}/${model.id}`) && [input, output, cacheRead, cacheWrite].every((rate) => rate >= 0);
}

// A provider's built-in models with its live ones laid over them: same ids replaced in place, new ones added.
function merged(builtIn: readonly Model<Api>[], live: readonly Model<Api>[]): Model<Api>[] {
  const byId = new Map(builtIn.map((model) => [`${model.provider}/${model.id}`, model]));
  for (const model of live) byId.set(`${model.provider}/${model.id}`, model);
  return [...byId.values()];
}

export async function builtinModels(ctx: Ctx, provider?: string): Promise<Model<Api>[]> {
  return merged((await builtinCatalog()).getModels(provider), await liveModels(ctx, provider)).filter(priced);
}

export async function builtinModel(ctx: Ctx, provider: string, modelId: string): Promise<Model<Api> | undefined> {
  const model = (await liveModels(ctx, provider)).find((live) => live.id === modelId) ?? (await builtinCatalog()).getModel(provider, modelId);
  return model !== undefined && priced(model) ? model : undefined;
}
