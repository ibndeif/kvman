import type { Api, Model, Models } from '@earendil-works/pi-ai';

// pi-ai's built-in providers and models (plan 07 §7.2, ADR 0009, 52). The catalog is large, so each worker loads it at
// its first use rather than when kvai loads. It never refreshes, so it makes no network calls. A model whose price
// varies has negative rates in pi-ai, and kvai leaves it out (ADR 0009, 65).

let loading: Promise<Models> | undefined;

export function builtinCatalog(): Promise<Models> {
  loading ??= import('@earendil-works/pi-ai/providers/all').then((all) => all.builtinModels());
  return loading;
}

function priced(model: Model<Api>): boolean {
  const { input, output, cacheRead, cacheWrite } = model.cost;
  return [input, output, cacheRead, cacheWrite].every((rate) => rate >= 0);
}

export async function builtinModels(provider?: string): Promise<Model<Api>[]> {
  return (await builtinCatalog()).getModels(provider).filter(priced);
}

export async function builtinModel(provider: string, modelId: string): Promise<Model<Api> | undefined> {
  const model = (await builtinCatalog()).getModel(provider, modelId);
  return model !== undefined && priced(model) ? model : undefined;
}
