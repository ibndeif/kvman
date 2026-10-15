import type { Api, AuthContext, CredentialStore, Model, Models } from '@earendil-works/pi-ai';

// pi-ai's built-in providers and models (plan 07 §7.2, ADR 0009, 52). The catalog is large, so each worker loads it at
// its first use rather than when kvai loads. It never refreshes, so it makes no network calls. A model whose price
// varies is left out: one with a negative rate, and OpenRouter's routers, which pi-ai prices at 0 (ADR 0009, 65; ADR 0083, 3).

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

const routerModels = new Set(['openrouter/openrouter/auto', 'openrouter/openrouter/auto-beta', 'openrouter/typesafe/jev-router']);

function priced(model: Model<Api>): boolean {
  const { input, output, cacheRead, cacheWrite } = model.cost;
  return !routerModels.has(`${model.provider}/${model.id}`) && [input, output, cacheRead, cacheWrite].every((rate) => rate >= 0);
}

export async function builtinModels(provider?: string): Promise<Model<Api>[]> {
  return (await builtinCatalog()).getModels(provider).filter(priced);
}

export async function builtinModel(provider: string, modelId: string): Promise<Model<Api> | undefined> {
  const model = (await builtinCatalog()).getModel(provider, modelId);
  return model !== undefined && priced(model) ? model : undefined;
}
