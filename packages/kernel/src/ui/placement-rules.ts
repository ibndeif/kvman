import { frameSlots, type Issue, type Manifest } from '@kvman/protocol';
import { objectOf, stringAt } from '../validation/json-reading.ts';
import type { UiSite } from './ui-sites.ts';
import { uiEntries, type UiWorld } from './ui-world.ts';
import { checkValue, type ValueChecker } from './value-checks.ts';

const frameSlotsByName = new Map(frameSlots.map((slot) => [slot.name, slot]));

function accepted(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((kind): kind is string => typeof kind === 'string') : [];
}

function slotsTaking(kind: string): string[] {
  return frameSlots.filter((slot) => slot.accepts.some((accepts) => accepts === kind)).map((slot) => slot.name);
}

function refusal(slot: string, accepts: readonly string[], kind: string, path: string): Issue {
  const frames = slotsTaking(kind);
  const elsewhere = frames.length === 0 ? `an extension slot that accepts ${kind}` : `${frames.join(' or ')}, or an extension slot that accepts ${kind}`;
  return { path, message: `${slot} does not accept a ${kind}`, hint: `${slot} accepts ${accepts.join(', ')}; a ${kind} goes in ${elsewhere}` };
}

function inactive(path: string, name: string, what: string, world: UiWorld): Issue {
  return { path, message: `${name} belongs to ${world.ownerOf(name)}, which is not enabled here: the ${what} is inactive`, severity: 'warning' };
}

// 08 §8.4 "Slots": a panel's or toolbar item's slot accepts its kind: a frame slot by the catalog, an own slot by its
// registration, another extension's slot by the workspace, where a slot whose owner is not enabled makes the item
// inactive (a warning).
function slotIssues(site: UiSite, world: UiWorld, author: Manifest): Issue[] {
  const slot = site.slot;
  if (slot === undefined) return [];
  const kind = site.kind;
  const path = `${site.path}.slot`;
  const frame = frameSlotsByName.get(slot);
  if (frame !== undefined) return frame.accepts.some((accepts) => accepts === kind) ? [] : [refusal(slot, frame.accepts, kind, path)];
  if (slot.startsWith('frame.')) return [{ path, message: `${slot} is not a frame slot`, hint: `frame slots: ${[...frameSlotsByName.keys()].join(', ')}` }];
  if (!world.judges(slot, author)) return [];
  const found = world.slots.get(slot);
  if (found === undefined) {
    if (slot.startsWith(`${author.meta.namespace}.`)) return [{ path, message: `${slot} is not a slot of ${author.meta.name}`, hint: `register it with ext.registerSlot('${slot}', …)` }];
    return [inactive(path, slot, kind, world)];
  }
  const accepts = accepted(found.value['accepts']);
  return accepts.includes(kind) ? [] : [refusal(slot, accepts, kind, path)];
}

// 08 §8.4 "Inactive contributions": an action on another extension's entity and a renderer for its target are
// inactive while that extension is not enabled.
function recordIssues(site: UiSite, world: UiWorld, author: Manifest): Issue[] {
  const item = site.item;
  if (item === undefined || item.kind === 'unchecked') return [];
  const name = item.kind === 'entity' ? item.entity : item.target;
  if (!world.judges(name, author)) return [];
  const exists = item.kind === 'entity' ? world.hasEntity(name) : world.hasTarget(name);
  if (exists) return [];
  const path = site.kind === 'action' ? `${site.path}.entity` : `${site.path}.target`;
  if (name.startsWith(`${author.meta.namespace}.`)) return [{ path, message: `${name} is not ${item.kind === 'entity' ? 'an entity' : 'a renderer target'} of ${author.meta.name}` }];
  return [inactive(path, name, site.kind, world)];
}

export function placementIssues(site: UiSite, world: UiWorld, author: Manifest): Issue[] {
  const placed = site.kind === 'panel' || site.kind === 'toolbarItem' ? slotIssues(site, world, author) : [];
  const recorded = site.kind === 'action' || site.kind === 'renderer' ? recordIssues(site, world, author) : [];
  return [...placed, ...recorded];
}

// 08 §8.4: only a slot's owner places it, and the props it passes fit the slot's props schema.
export function slotNodeIssues(site: UiSite, world: UiWorld, author: Manifest | undefined, values: ValueChecker | undefined): Issue[] {
  return site.facts.flatMap((fact): Issue[] => {
    if (fact.kind !== 'node' || fact.type !== 'slot') return [];
    const name = stringAt(fact.node, 'name') ?? '';
    const found = world.slots.get(name);
    if (author === undefined || found === undefined || found.owner.meta.name !== author.meta.name) {
      const whose = author === undefined ? 'a preset' : author.meta.name;
      return [{ path: `${fact.path}.name`, message: `${name} is not a slot of ${whose}; only a slot's owner places it`, hint: 'place one of your own slots, registered with ext.registerSlot' }];
    }
    const schema = objectOf(found.value['props']);
    const props = fact.node['props'] ?? {};
    return schema === undefined ? [] : checkValue(values, { schema, value: props, root: `${fact.path}.props` });
  });
}

// ADR 0156: a nav item opens one of its own extension's pages.
export function navItemIssues(author: Manifest): Issue[] {
  const pages = new Set(uiEntries(author, 'pages').map((page) => stringAt(page, 'id')));
  return uiEntries(author, 'navItems').flatMap((item, index): Issue[] => {
    const page = stringAt(item, 'page') ?? '';
    return pages.has(page) ? [] : [{ path: `ui.navItems.${index}.page`, message: `${page} is not a page of ${author.meta.name}`, hint: 'a nav item opens one of its own pages' }];
  });
}
