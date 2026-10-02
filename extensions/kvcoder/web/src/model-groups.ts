// The model picker's groups (plan 08 §8.7, ADR 0009, 136, 140): the models of providers that can be called, under each
// provider's title, in title order; the session's own model is listed whatever its provider's status. A search keeps
// the models whose name or id has every word typed.

export type ProviderRow = { id: string; title: string; status: 'ready' | 'needsKey' | 'noKey' };
export type ModelRow = { id: string; name: string; provider: string };
export type ModelGroup = { provider: string; title: string; models: { id: string; name: string }[] };

export function modelGroups(providers: readonly ProviderRow[], models: readonly ModelRow[], current: string | null): ModelGroup[] {
  const titles = new Map(providers.map((provider) => [provider.id, provider.title]));
  const callable = new Set(providers.filter((provider) => provider.status !== 'needsKey').map((provider) => provider.id));
  const shown = models.filter((model) => callable.has(model.provider) || model.id === current);
  const groups = new Map<string, ModelGroup>();
  for (const model of shown) {
    const group = groups.get(model.provider) ?? { provider: model.provider, title: titles.get(model.provider) ?? model.provider, models: [] };
    group.models.push({ id: model.id, name: model.name });
    groups.set(model.provider, group);
  }
  return [...groups.values()].sort((first, second) => first.title.localeCompare(second.title));
}

export type Found = { groups: ModelGroup[]; shown: number; total: number };

/** The groups' models that match every word of `query` in their name or id, case-insensitively. */
export function searchGroups(groups: readonly ModelGroup[], query: string): Found {
  const words = query.toLowerCase().split(/\s+/).filter((word) => word !== '');
  const matches = (model: { id: string; name: string }): boolean => words.every((word) => `${model.name} ${model.id}`.toLowerCase().includes(word));
  const kept = groups.map((group) => ({ ...group, models: group.models.filter(matches) })).filter((group) => group.models.length > 0);
  return { groups: kept, shown: kept.reduce((sum, group) => sum + group.models.length, 0), total: groups.reduce((sum, group) => sum + group.models.length, 0) };
}
