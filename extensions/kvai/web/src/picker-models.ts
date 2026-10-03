import type { ProviderRow } from './provider-groups.ts';

// A model row of `kvai.model.list` as the picker needs it (plan 07 §7.2).
export type PickerModel = { id: string; name: string; provider: string; isDefault: boolean };

// One provider's models in the picker, in the order of the providers' titles.
export type PickerGroup = { provider: string; title: string; models: PickerModel[] };

/** Providers the picker lists models of: connected ones and every custom provider, A–Z by title. */
export function callableRows(rows: readonly ProviderRow[]): ProviderRow[] {
  return rows
    .filter((row) => row.connection !== null || !row.builtIn)
    .sort((left, right) => left.title.localeCompare(right.title));
}

/** Models whose name or id holds the query, ignoring case and surrounding spaces; all of them when it is empty. */
export function matchModels(models: readonly PickerModel[], query: string): PickerModel[] {
  const needle = query.trim().toLocaleLowerCase();
  if (needle === '') return [...models];
  return models.filter(
    (model) => model.name.toLocaleLowerCase().includes(needle) || model.id.toLocaleLowerCase().includes(needle),
  );
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

/** At most `limit` models, with how many were cut. */
export function limitModels<Item>(models: readonly Item[], limit: number): { shown: Item[]; hidden: number } {
  const shown = models.slice(0, limit);
  return { shown, hidden: models.length - shown.length };
}
