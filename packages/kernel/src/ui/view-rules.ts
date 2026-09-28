import { matchesTypePattern, parseBindingPath, type Issue, type Manifest } from '@kvman/protocol';
import { objectOf, stringAt } from '../validation/json-reading.ts';
import { lookupPath } from '../validation/schema-paths.ts';
import { entityRouteMatches } from './routes.ts';
import type { UiSite } from './ui-sites.ts';
import { uiEntries, type UiWorld } from './ui-world.ts';
import { isBuiltin } from './view-walk.ts';

const reservedParams = ['ws', 'side', 'embed'];
const maxDialogDepth = 2;
const interpolation = /\{\{\s*([^{}]*?)\s*\}\}/g;

// 08 §8.3: `ws`, `side`, and `embed` are the shell's own search parameters.
function reservedParamIssues(site: UiSite): Issue[] {
  if (site.kind !== 'page') return [];
  return Object.keys(objectOf(site.entry['params']) ?? {}).filter((name) => reservedParams.includes(name)).map((name) => ({
    path: `${site.path}.params.${name}`, message: `"${name}" is a search parameter of the shell`, hint: 'rename the parameter',
  }));
}

// 08 §8.5: the palette has no record, so a palette action reads no `$item`.
function paletteIssues(site: UiSite): Issue[] {
  const placement = site.entry['placement'];
  if (site.kind !== 'action' || !Array.isArray(placement) || !placement.includes('palette')) return [];
  const reads = site.facts.find((fact) => fact.kind === 'binding' && fact.binding.root === 'item');
  if (reads === undefined) return [];
  return [{ path: reads.path, message: 'a palette action has no record to read $item from', hint: 'drop "palette" from placement, or stop reading $item' }];
}

// 08 §8.7: refreshOn names durable or transient events, never live ones.
function refreshOnIssues(site: UiSite, world: UiWorld, author: Manifest): Issue[] {
  const live = world.manifests.flatMap((manifest) => manifest.types).filter((entry) => entry.kind === 'event' && entry.delivery === 'live');
  return site.facts.flatMap((fact): Issue[] => {
    if (fact.kind !== 'refreshOn' || fact.pattern.includes('*')) return [];
    const event = live.find((entry) => matchesTypePattern(fact.pattern, entry.type) && world.judges(entry.type, author));
    return event === undefined ? [] : [{ path: fact.path, message: `${event.type} is a live event; refreshOn names durable or transient events`, hint: 'show a live event with a live prop instead' }];
  });
}

// The deepest dialog nesting each composite's view reaches, following the composites it uses.
export function dialogsInside(components: ReadonlyMap<string, UiSite>): (component: string) => number {
  const known = new Map<string, number>();
  const walking = new Set<string>();
  const inside = (component: string): number => {
    const cached = known.get(component);
    if (cached !== undefined) return cached;
    const site = components.get(component);
    if (site === undefined || walking.has(component)) return 0;
    walking.add(component);
    const depths = site.facts.map((fact) => (fact.kind === 'node' ? fact.dialogDepth + (isBuiltin(fact.type) ? 0 : inside(fact.type)) : 0));
    walking.delete(component);
    const depth = Math.max(0, ...depths);
    known.set(component, depth);
    return depth;
  };
  return inside;
}

// 08 §8.7: dialogs nest at most 2 deep, counting the dialogs inside the composites a view uses.
function dialogIssues(site: UiSite, inside: (component: string) => number): Issue[] {
  return site.facts.flatMap((fact): Issue[] => {
    if (fact.kind !== 'node') return [];
    const depth = fact.dialogDepth + (isBuiltin(fact.type) ? 0 : inside(fact.type));
    if (depth <= maxDialogDepth) return [];
    return [{ path: fact.path, message: `dialogs nest ${depth} deep here; at most ${maxDialogDepth} are allowed`, hint: 'open the deeper view as a page instead' }];
  });
}

// 08 §8.8: a page node shows a record only with both `entity` and `record`; `settingsSections` is for kernel.admin.
function nodeRuleIssues(site: UiSite, admin: boolean): Issue[] {
  return site.facts.flatMap((fact): Issue[] => {
    if (fact.kind !== 'node') return [];
    if (fact.type === 'page' && (fact.node['entity'] === undefined) !== (fact.node['record'] === undefined)) {
      return [{ path: fact.path, message: 'a page node sets entity and record together', hint: 'set both, or neither' }];
    }
    if (fact.type === 'settingsSections' && !admin) {
      return [{ path: `${fact.path}.type`, message: 'only an extension holding kernel.admin shows settings sections', hint: 'link to /settings instead' }];
    }
    return [];
  });
}

export function viewRuleIssues(site: UiSite, world: UiWorld, author: Manifest | undefined, inside: (component: string) => number): Issue[] {
  const admin = author?.permissions.capabilities.some((capability) => capability.name === 'kernel.admin') === true;
  return [
    ...reservedParamIssues(site), ...paletteIssues(site), ...(author === undefined ? [] : refreshOnIssues(site, world, author)),
    ...dialogIssues(site, inside), ...nodeRuleIssues(site, admin),
  ];
}

function routeItemIssues(route: string, schema: Manifest['entities'][number]['schema'], path: string): Issue[] {
  return [...route.matchAll(interpolation)].flatMap((match): Issue[] => {
    const parsed = parseBindingPath(match[1] ?? '');
    if (!parsed.ok || parsed.path.root !== 'item' || lookupPath(schema, parsed.path.segments, { arrays: true }).found) return [];
    return [{ path, message: `$item.${parsed.path.segments.join('.')} does not exist in the entity's schema` }];
  });
}

// 05 §5.3: an entity's route opens one of its owner's pages, its `$item` values filling the page's `:params`.
export function entityRouteIssues(author: Manifest): Issue[] {
  const routes = uiEntries(author, 'pages').map((page) => stringAt(page, 'route') ?? '');
  return author.entities.flatMap((entity, index): Issue[] => {
    if (entity.route === undefined) return [];
    const route = entity.route;
    const path = `entities.${index}.route`;
    const items = routeItemIssues(route, entity.schema, path);
    if (routes.some((pageRoute) => entityRouteMatches(route, pageRoute))) return items;
    return [{ path, message: `no page of ${author.meta.name} has the route ${route}`, hint: 'use the route of one of its pages, with {{ $item.<field> }} for each :param' }, ...items];
  });
}
