import type { JsonObject } from '@kvman/protocol';
import { fallbackChain } from '../i18n/catalogs.ts';
import { presetPageSites, uiSites, type UiSite } from '../ui/ui-sites.ts';
import { definitionOf, presetEntries } from './active-ui.ts';
import { compositesUsedBy } from './composite-uses.ts';
import { activeManifests, compareText, type RegistrySources } from './registry-sources.ts';

type OwnedSite = { owner: string; site: UiSite };

// ADR 0159: a page of an active extension or of the preset, with every composite it uses, transitively; a hidden
// page is answered too. `undefined` when no such page is active in the workspace.
export function pageAnswer(sources: RegistrySources, pageId: string): JsonObject | undefined {
  const manifests = activeManifests(sources);
  const sites: OwnedSite[] = [
    ...manifests.flatMap((manifest) => uiSites(manifest).map((site) => ({ owner: manifest.meta.name, site }))),
    ...presetPageSites(presetEntries(sources.preset.pages)).map((site) => ({ owner: 'preset', site })),
  ];
  const page = sites.find(({ site }) => site.kind === 'page' && site.id === pageId);
  if (page === undefined) return undefined;
  const composites = new Map(sites.filter(({ site }) => site.kind === 'component').map((entry) => [entry.site.id, entry]));
  const used = compositesUsedBy([page.site], new Map([...composites].map(([name, entry]) => [name, entry.site])));
  const components = [...used].sort(compareText).flatMap((name) => {
    const composite = composites.get(name);
    return composite === undefined ? [] : [{ name, owner: composite.owner, def: definitionOf(composite.site.entry, 'id') }];
  });
  return { page: definitionOf(page.site.entry, page.owner === 'preset' ? 'name' : 'id'), components };
}

// ADR 0159: each active extension's catalogs and the preset's, for the saved language, its base language, and the
// owner's default locale, nested as registered.
export function translationsAnswer(sources: RegistrySources, locale: string): JsonObject {
  const owners = [
    ...activeManifests(sources).map((manifest) => ({ owner: manifest.meta.name, translations: manifest.translations })),
    { owner: 'preset', translations: sources.preset.translations ?? null },
  ];
  const catalogs: JsonObject = {};
  for (const { owner, translations } of owners) {
    if (translations === null) continue;
    catalogs[owner] = Object.fromEntries(fallbackChain(translations, locale).map((chained) => [chained, translations.catalogs[chained] ?? {}]));
  }
  return { locale, catalogs };
}
