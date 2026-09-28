import type { JsonObject, Manifest } from '@kvman/protocol';
import { uiEntries } from '../ui/ui-world.ts';
import { numberAt, stringAt } from '../validation/json-reading.ts';
import { definitionOf, presetEntries, type ActiveUi } from './active-ui.ts';

// An item placed in a slot, with what orders it (08 §8.4).
export type Placed = { slot: string; order: number; id: string; owner: string; kind: string; item: JsonObject };

type PlacedKind = 'navGroups' | 'navItems' | 'toolbarItems' | 'statusItems' | 'panels';

const kinds: Readonly<Record<PlacedKind, { kind: string; slot: (entry: JsonObject) => string | undefined }>> = {
  navGroups: { kind: 'navGroup', slot: () => 'frame.sidebar' },
  navItems: { kind: 'navItem', slot: () => 'frame.sidebar' },
  toolbarItems: { kind: 'toolbarItem', slot: (entry) => stringAt(entry, 'slot') },
  statusItems: { kind: 'statusItem', slot: (entry) => `frame.statusbar.${stringAt(entry, 'side') ?? 'end'}` },
  panels: { kind: 'panel', slot: (entry) => stringAt(entry, 'slot') },
};

const placedKinds: readonly PlacedKind[] = ['navGroups', 'navItems', 'toolbarItems', 'statusItems', 'panels'];

// ADR 0159: an item is left out when hidden, aimed at a slot no active extension declares (inactive), or a nav
// item whose page is hidden or not active.
function place(ui: ActiveUi, candidate: Omit<Placed, 'order' | 'item' | 'slot'> & { slot: string | undefined; def: JsonObject }): Placed[] {
  const { slot, id, owner, kind, def } = candidate;
  if (slot === undefined || !ui.hasSlot(slot) || ui.isHidden(id)) return [];
  if (kind === 'navItem' && !ui.opensVisiblePage(stringAt(def, 'page'))) return [];
  return [{ slot, order: numberAt(def, 'order') ?? 500, id, owner, kind, item: ui.item(id, owner, kind, def) }];
}

function extensionItems(ui: ActiveUi, manifest: Manifest): Placed[] {
  return placedKinds.flatMap((uiKind) => uiEntries(manifest, uiKind).flatMap((entry) => place(ui, {
    slot: kinds[uiKind].slot(entry), id: stringAt(entry, 'id') ?? '', owner: manifest.meta.name, kind: kinds[uiKind].kind, def: definitionOf(entry, 'id'),
  })));
}

function presetItems(ui: ActiveUi): Placed[] {
  const entries = [
    ...presetEntries(ui.preset.navGroups).map((entry) => ({ entry, kind: 'navGroup' })),
    ...presetEntries(ui.preset.nav).map((entry) => ({ entry, kind: 'navItem' })),
  ];
  return entries.flatMap(({ entry, kind }) => place(ui, {
    slot: 'frame.sidebar', id: `preset.${stringAt(entry, 'name') ?? ''}`, owner: 'preset', kind, def: definitionOf(entry, 'name'),
  }));
}

// Every item the workspace places in a slot, before ordering.
export function placedItems(ui: ActiveUi): Placed[] {
  return [...ui.manifests.flatMap((manifest) => extensionItems(ui, manifest)), ...presetItems(ui)];
}
