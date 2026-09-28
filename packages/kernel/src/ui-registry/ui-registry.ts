import { frameSlots, type JsonObject } from '@kvman/protocol';
import { uiSites } from '../ui/ui-sites.ts';
import { uiEntries } from '../ui/ui-world.ts';
import { arrayAt, numberAt, stringAt } from '../validation/json-reading.ts';
import { ActiveUi } from './active-ui.ts';
import { compositesUsedBy } from './composite-uses.ts';
import { attachedItems, registryCatalogs, registryComponents, registryExtensions, registryPages, registrySections } from './registry-parts.ts';
import { activeManifests, type RegistrySources } from './registry-sources.ts';
import { placedItems, type Placed } from './slot-items.ts';
import { sidebarItems, slotItems } from './slot-order.ts';

function slotsOf(ui: ActiveUi, placed: readonly Placed[]): JsonObject {
  const order = ui.preset.layout?.order ?? {};
  const itemsIn = (slot: string): JsonObject[] => {
    const inSlot = placed.filter((entry) => entry.slot === slot);
    return slot === 'frame.sidebar' ? sidebarItems(inSlot, order[slot]) : slotItems(inSlot, order[slot]);
  };
  const frame = frameSlots.map((slot) => [slot.name, {
    owner: 'frame', accepts: [...slot.accepts], ...(slot.max === undefined ? {} : { max: slot.max }), items: itemsIn(slot.name),
  }] as const);
  const own = ui.manifests.flatMap((manifest) => uiEntries(manifest, 'slots').map((entry) => {
    const name = stringAt(entry, 'id') ?? '';
    const layout = stringAt(entry, 'layout');
    const max = numberAt(entry, 'max');
    return [name, {
      owner: manifest.meta.name, accepts: arrayAt(entry, 'accepts'), ...(layout === undefined ? {} : { layout }), ...(max === undefined ? {} : { max }),
      items: itemsIn(name),
    }] as const;
  }));
  return Object.fromEntries([...frame, ...own]);
}

// The composites that non-page items use (ADR 0159): panels, toolbar and status items, actions, renderers, and
// settings sections, and the composites those use.
function compositesOutsidePages(ui: ActiveUi): Set<string> {
  const sites = ui.manifests.flatMap(uiSites);
  const composites = new Map(sites.filter((site) => site.kind === 'component').map((site) => [site.id, site]));
  return compositesUsedBy(sites.filter((site) => site.kind !== 'page' && site.kind !== 'component'), composites);
}

// 08 §8.6: the registry is computed, not stored; validation already ran, so this only merges, orders, and filters.
export function uiRegistry(sources: RegistrySources, revision: string): JsonObject {
  const ui = new ActiveUi(activeManifests(sources), sources.preset);
  const { app, layout } = sources.preset;
  return {
    workspaceId: sources.workspaceId,
    revision,
    app: {
      title: app.title, ...(app.icon === undefined ? {} : { icon: app.icon }), ...(app.theme?.accent === undefined ? {} : { accent: app.theme.accent }),
      themeMode: app.theme?.mode ?? 'system', home: app.home,
    },
    layout: { sidebar: layout?.sidebar ?? 'expanded', statusbar: layout?.statusbar ?? 'shown' },
    slots: slotsOf(ui, placedItems(ui)),
    pages: registryPages(ui),
    actions: attachedItems(ui, 'actions'),
    renderers: attachedItems(ui, 'renderers'),
    components: registryComponents(ui, compositesOutsidePages(ui)),
    extensions: registryExtensions(ui),
    settingsSections: registrySections(ui),
    catalogs: registryCatalogs(ui),
  };
}
