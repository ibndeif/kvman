import type { ProviderRow } from './provider-groups.ts';

// A model row of `kvai.model.list` as the picker needs it (plan 07 §7.2).
export type PickerModel = { id: string; name: string; provider: string };

// One provider's models in the picker, in the order of the providers' titles.
export type PickerGroup = { provider: string; title: string; models: PickerModel[] };

/** Providers the picker lists models of: connected ones and every custom provider, A–Z by title. */
export function callableRows(rows: readonly ProviderRow[]): ProviderRow[] {
  return rows
    .filter((row) => row.connection !== null || !row.builtIn)
    .sort((left, right) => left.title.localeCompare(right.title));
}

/** Models whose name or id holds every word of the query, ignoring case; all of them when it is empty (ADR 0015, 2). */
export function matchModels(models: readonly PickerModel[], query: string): PickerModel[] {
  const words = query.toLocaleLowerCase().split(/\s+/).filter((word) => word !== '');
  return models.filter((model) => words.every((word) => `${model.name} ${model.id}`.toLocaleLowerCase().includes(word)));
}

/** Models grouped under their provider's title, in the titles' order; a title with no model is left out. */
export function groupByProvider(models: readonly PickerModel[], titles: ReadonlyMap<string, string>): PickerGroup[] {
  const byProvider = new Map<string, PickerModel[]>();
  for (const model of models) {
    const group = byProvider.get(model.provider) ?? [];
    group.push(model);
    byProvider.set(model.provider, group);
  }
  const groups: PickerGroup[] = [];
  for (const [provider, title] of titles) {
    const group = byProvider.get(provider);
    if (group !== undefined && group.length > 0) groups.push({ provider, title, models: group });
  }
  return groups;
}
