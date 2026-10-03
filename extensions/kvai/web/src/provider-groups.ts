import { keyTiles, planTiles, type FeaturedTile } from './featured.ts';

// A provider row of `kvai.provider.list` (plan 07 §7.2).
export type ProviderRow = {
  id: string;
  title: string;
  builtIn: boolean;
  status: string;
  models: number;
  connection: 'apiKey' | 'oauth' | null;
  signIn: boolean;
  apiKey: boolean;
};

// The default model of `kvai.model.default.get` (plan 07 §7.2).
export type DefaultModel = { id: string | null; name: string | null; ready: boolean };

/** The provider part of a full model id (split at the first `/`). */
export function providerOf(modelId: string): string {
  const slash = modelId.indexOf('/');
  return slash < 0 ? modelId : modelId.slice(0, slash);
}

/** Providers that are usable: connected ones, and every custom provider. */
export function connectedRows(rows: readonly ProviderRow[]): ProviderRow[] {
  return rows.filter((row) => row.connection !== null || !row.builtIn);
}

/** Built-in providers that are not connected, A–Z by title. */
export function unconnectedBuiltIns(rows: readonly ProviderRow[]): ProviderRow[] {
  return rows.filter((row) => row.builtIn && row.connection === null).sort((left, right) => left.title.localeCompare(right.title));
}

/** The quick-connect tiles whose provider is listed and not connected, grouped by kind. */
export function featuredTiles(rows: readonly ProviderRow[]): { plan: FeaturedTile[]; key: FeaturedTile[] } {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const usable = (tile: FeaturedTile): boolean => {
    const row = byId.get(tile.provider);
    return row !== undefined && row.connection === null;
  };
  return { plan: planTiles.filter(usable), key: keyTiles.filter(usable) };
}
