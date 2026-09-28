import { frameSlots, jsonObjectSchema, type Issue, type JsonObject, type Manifest, type Preset } from '@kvman/protocol';
import { stringAt } from '../validation/json-reading.ts';
import { routeIssues, routesClash } from './routes.ts';
import type { ActivePage } from './route-rules.ts';
import { uiEntries, type UiKind } from './ui-world.ts';

const contributionKinds: readonly UiKind[] = ['pages', 'navGroups', 'navItems', 'toolbarItems', 'statusItems', 'panels', 'actions', 'renderers', 'components'];

function warning(path: string, message: string): Issue {
  return { path, message, severity: 'warning' };
}

// Every id a preset may hide, relabel, or order (08 §8.17): the enabled extensions' contributions and settings
// sections, and the preset's own pages, nav groups, and nav items.
function knownIds(preset: Preset, enabled: readonly Manifest[]): Set<string> {
  const ids = new Set<string>();
  for (const manifest of enabled) {
    for (const kind of contributionKinds) for (const entry of uiEntries(manifest, kind)) ids.add(stringAt(entry, 'id') ?? '');
    if (manifest.config !== null || manifest.ui.settingsSection !== null) ids.add(`settings.section.${manifest.meta.namespace}`);
  }
  for (const entries of [preset.pages, preset.navGroups, preset.nav]) {
    for (const entry of entries ?? []) ids.add(`preset.${stringAt(jsonObjectSchema.parse(entry), 'name') ?? ''}`);
  }
  return ids;
}

function knownSlots(enabled: readonly Manifest[]): Set<string> {
  return new Set([...frameSlots.map((slot) => slot.name), ...enabled.flatMap((manifest) => uiEntries(manifest, 'slots').map((slot) => stringAt(slot, 'id') ?? ''))]);
}

// 06 §6.3: unknown ids in `hidden`, `labels`, and `layout.order` are warnings, because a preset may name the
// contributions of extensions it does not enable.
function visibilityWarnings(preset: Preset, enabled: readonly Manifest[]): Issue[] {
  const ids = knownIds(preset, enabled);
  const slots = knownSlots(enabled);
  const hidden = (preset.hidden ?? []).flatMap((id, index) => (ids.has(id) ? [] : [warning(`hidden.${index}`, `nothing enabled here has the id ${id}`)]));
  const labels = Object.keys(preset.labels ?? {}).flatMap((id) => (ids.has(id) ? [] : [warning(`labels.${id}`, `nothing enabled here has the id ${id}`)]));
  const order = Object.entries(preset.layout?.order ?? {}).flatMap(([slot, items]) => [
    ...(slots.has(slot) ? [] : [warning(`layout.order.${slot}`, `${slot} is not a slot of the frame or of an enabled extension`)]),
    ...items.flatMap((id, index) => (id === '---' || ids.has(id) ? [] : [warning(`layout.order.${slot}.${index}`, `nothing enabled here has the id ${id}`)])),
  ]);
  return [...hidden, ...labels, ...order];
}

// 07 §7.3, ADR 0151: the preset's nav items open pages that exist, and `app.home` is the route of an active page
// (`PRESET_REFERENCE_MISSING`).
export function presetReferenceIssues(preset: Preset, pages: readonly ActivePage[]): Issue[] {
  const ids = new Set(pages.map((page) => page.id));
  const nav = (preset.nav ?? []).flatMap((entry, index): Issue[] => {
    const page = stringAt(jsonObjectSchema.parse(entry), 'page') ?? '';
    return ids.has(page) ? [] : [{ path: `nav.${index}.page`, message: `no active page has the id ${page}`, hint: 'point the nav item at a preset page or a page of an enabled extension' }];
  });
  const home = preset.app.home;
  const opens = pages.some((page) => routeIssues(page.route, page.path).length === 0 && routesClash(page.route, home));
  const homeIssues = opens ? [] : [{ path: 'app.home', message: `no active page opens on ${home}`, hint: `routes of the active pages: ${pages.map((page) => page.route).join(', ')}` }];
  return [...nav, ...homeIssues];
}

export function presetWarnings(preset: Preset, enabled: readonly Manifest[]): Issue[] {
  return visibilityWarnings(preset, enabled);
}

export function presetPages(preset: Preset): { entries: JsonObject[]; pages: ActivePage[] } {
  const entries = (preset.pages ?? []).map((entry) => jsonObjectSchema.parse(entry));
  return {
    entries,
    pages: entries.map((entry, index) => ({ id: `preset.${stringAt(entry, 'name') ?? ''}`, route: stringAt(entry, 'route') ?? '', path: `pages.${index}.route` })),
  };
}
