import { frameSlots, type Issue, type JsonObject, type Manifest } from '@kvman/protocol';
import { objectOf, stringAt } from '../validation/json-reading.ts';
import { lookupPath } from '../validation/schema-paths.ts';
import { routeParams } from './routes.ts';
import type { UiSite } from './ui-sites.ts';
import type { UiWorld } from './ui-world.ts';
import type { ItemContext, ViewFact } from './view-walk.ts';

type BindingFact = Extract<ViewFact, { kind: 'binding' }>;

// A schema to check a binding's path against, nothing to check, or a problem with the root itself.
type Reading = { schema: JsonObject; describedAs: string } | { unchecked: true } | { problem: Omit<Issue, 'path'> };

const frameSlotNames = new Set(frameSlots.map((slot) => slot.name));
const unchecked: Reading = { unchecked: true };

function schemaReading(schema: JsonObject | undefined, describedAs: string): Reading {
  return schema === undefined ? unchecked : { schema, describedAs };
}

function itemReading(item: ItemContext, world: UiWorld, author: Manifest | undefined): Reading {
  if (item.kind === 'unchecked') return unchecked;
  if (item.kind === 'entity') return world.judges(item.entity, author) ? schemaReading(world.entitySchema(item.entity), `the entity ${item.entity}`) : unchecked;
  return world.judges(item.target, author) ? schemaReading(world.targetItem(item.target), `the item of ${item.target}`) : unchecked;
}

function slotReading(site: UiSite, world: UiWorld, author: Manifest | undefined): Reading {
  const slot = site.slot;
  if (slot === undefined) return { problem: { message: '$slot is read only by a panel or toolbar item placed in a slot' } };
  if (frameSlotNames.has(slot)) return { problem: { message: `${slot} is a frame slot, which passes no props`, hint: 'read $slot only in an extension slot that declares props' } };
  if (!world.judges(slot, author)) return unchecked;
  return schemaReading(objectOf(world.slots.get(slot)?.value['props']), `the props of ${slot}`);
}

function queryReading(site: UiSite, alias: string, world: UiWorld, author: Manifest | undefined): Reading {
  if (site.aliases === undefined) return unchecked;
  const type = site.aliases.get(alias);
  if (type === undefined) {
    const known = [...site.aliases.keys()];
    return { problem: { message: `no query "${alias}" is declared here`, hint: known.length === 0 ? 'declare it under queries' : `declared: ${known.join(', ')}` } };
  }
  if (!type.startsWith('kernel.') && !world.judges(type, author)) return unchecked;
  const entry = world.resolve(type)?.entry;
  return entry?.kind === 'query' ? { schema: entry.output, describedAs: `the result of ${type}` } : unchecked;
}

function namesReading(names: readonly string[], describedAs: string): Reading {
  return { schema: { type: 'object', properties: Object.fromEntries(names.map((name) => [name, {}])), additionalProperties: false }, describedAs };
}

function pageReading(site: UiSite, root: 'route' | 'state'): Reading {
  if (site.kind !== 'page') return unchecked;
  if (root === 'state') return namesReading(Object.keys(objectOf(site.entry['state']) ?? {}), `the state of ${site.id}`);
  const params = [...routeParams(stringAt(site.entry, 'route') ?? '/'), ...Object.keys(objectOf(site.entry['params']) ?? {})];
  return namesReading(params, `the route and params of ${site.id}`);
}

function readingOf(fact: BindingFact, site: UiSite, world: UiWorld, author: Manifest | undefined): Reading {
  const { root, segments } = fact.binding;
  switch (root) {
    case 'item': return itemReading(fact.item, world, author);
    case 'slot': return slotReading(site, world, author);
    case 'props': {
      if (site.kind !== 'component') return { problem: { message: '$props is read only inside a composite component' } };
      return schemaReading(objectOf(site.entry['props']), `the props of ${site.id}`);
    }
    case 'query': return queryReading(site, segments[0] ?? '', world, author);
    case 'route': return pageReading(site, 'route');
    case 'state': return pageReading(site, 'state');
    default: return unchecked;
  }
}

// ADR 0157: each binding root with a schema checks the binding's path against it (ADR 0109's rule, with array
// indexes and `.length`).
export function bindingIssues(site: UiSite, world: UiWorld, author: Manifest | undefined): Issue[] {
  return site.facts.flatMap((fact): Issue[] => {
    if (fact.kind !== 'binding') return [];
    const reading = readingOf(fact, site, world, author);
    if ('unchecked' in reading) return [];
    if ('problem' in reading) return [{ path: fact.path, ...reading.problem }];
    const segments = fact.binding.root === 'query' ? fact.binding.segments.slice(1) : fact.binding.segments;
    const found = lookupPath(reading.schema, segments, { arrays: true });
    if (found.found) return [];
    const text = `$${[fact.binding.root, ...fact.binding.segments].join('.')}`;
    return [{
      path: fact.path, message: `${text} does not exist in ${reading.describedAs}`,
      ...(found.fields.length === 0 ? {} : { hint: `fields there: ${found.fields.join(', ')}` }),
    }];
  });
}
