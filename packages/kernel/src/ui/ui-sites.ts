import { jsonObjectSchema, type Json, type JsonObject, type Manifest } from '@kvman/protocol';
import { objectOf, stringAt } from '../validation/json-reading.ts';
import { uiEntries } from './ui-world.ts';
import { ViewWalker, type ItemContext, type ViewFact } from './view-walk.ts';

export type SiteKind = 'page' | 'navItem' | 'toolbarItem' | 'statusItem' | 'panel' | 'action' | 'renderer' | 'component' | 'settingsSection';

// A query a site reads outside its views: a declared query, a badge, or a slash menu, with its payload's path.
export type SiteQuery = { query: string; payload: Json | undefined; path: string; payloadPath: string };

// One registered piece of UI whose JSON holds views, actions, or bindings, with what its bindings may read.
export type UiSite = {
  kind: SiteKind;
  id: string;
  path: string;
  entry: JsonObject;
  facts: ViewFact[];
  // Declared query aliases and their types; `undefined` where nothing declares queries.
  aliases: ReadonlyMap<string, string> | undefined;
  reads: SiteQuery[];
  slot?: string;
  item?: ItemContext;
};

const unchecked: ItemContext = { kind: 'unchecked' };
const actionFields = ['command', 'payload', 'form', 'confirm', 'then', 'navigate', 'pane', 'openDialog'];

function declaredQueries(entry: JsonObject, path: string): { aliases: Map<string, string>; reads: SiteQuery[] } {
  const aliases = new Map<string, string>();
  const reads: SiteQuery[] = [];
  for (const [alias, declared] of Object.entries(objectOf(entry['queries']) ?? {})) {
    const query = stringAt(declared, 'query');
    if (query === undefined) continue;
    aliases.set(alias, query);
    reads.push({ query, payload: objectOf(declared)?.['payload'], path: `${path}.queries.${alias}.query`, payloadPath: `${path}.queries.${alias}.payload` });
  }
  return { aliases, reads };
}

function badgeRead(entry: JsonObject, path: string): SiteQuery[] {
  const badge = objectOf(entry['badge']);
  const query = stringAt(badge, 'query');
  return query === undefined ? [] : [{ query, payload: badge?.['payload'], path: `${path}.badge.query`, payloadPath: `${path}.badge.payload` }];
}

function rendererItem(target: string): ItemContext {
  if (target.startsWith('entity:')) return { kind: 'entity', entity: target.slice('entity:'.length) };
  if (target.startsWith('mime:')) return unchecked;
  return { kind: 'target', target };
}

// Walks the listed fields of an entry: `view` as a view tree, the others as values (actions, conditions, text).
function walk(entry: JsonObject, path: string, fields: readonly string[], item: ItemContext): ViewFact[] {
  const walker = new ViewWalker();
  walker.queries(entry['queries'], `${path}.queries`, item);
  for (const field of fields) {
    const value = entry[field];
    if (value === undefined) continue;
    if (field === 'view') walker.node(value, `${path}.view`, item, 0);
    else walker.value(value, `${path}.${field}`, item, 0);
  }
  return walker.facts;
}

type SiteSource = { kind: SiteKind; ui: 'pages' | 'navItems' | 'toolbarItems' | 'statusItems' | 'panels' | 'renderers'; fields: readonly string[] };

const sources: readonly SiteSource[] = [
  { kind: 'page', ui: 'pages', fields: ['title', 'view'] },
  { kind: 'navItem', ui: 'navItems', fields: ['label', 'badge'] },
  { kind: 'toolbarItem', ui: 'toolbarItems', fields: ['label', 'visibleIf', 'action', 'items', 'badge'] },
  { kind: 'statusItem', ui: 'statusItems', fields: ['label', 'visibleIf', 'action'] },
  { kind: 'panel', ui: 'panels', fields: ['title', 'visibleIf', 'view'] },
  { kind: 'renderer', ui: 'renderers', fields: ['view', 'props'] },
];

function plainSites(manifest: Manifest, source: SiteSource): UiSite[] {
  return uiEntries(manifest, source.ui).map((entry, index) => {
    const path = `ui.${source.ui}.${index}`;
    const target = stringAt(entry, 'target');
    const item = target === undefined ? unchecked : rendererItem(target);
    const declared = declaredQueries(entry, path);
    const facts = walk(entry, path, source.fields, item);
    const component = stringAt(entry, 'component');
    if (component !== undefined) facts.push({ kind: 'node', path, node: { type: component, ...(objectOf(entry['props']) ?? {}) }, type: component, dialogDepth: 0 });
    const slot = stringAt(entry, 'slot');
    return {
      kind: source.kind, id: stringAt(entry, 'id') ?? '', path, entry, facts, item,
      aliases: entry['queries'] === undefined ? undefined : declared.aliases, reads: [...declared.reads, ...badgeRead(entry, path)],
      ...(slot === undefined ? {} : { slot }),
    };
  });
}

function actionSites(manifest: Manifest): UiSite[] {
  return uiEntries(manifest, 'actions').map((entry, index) => {
    const path = `ui.actions.${index}`;
    const item: ItemContext = { kind: 'entity', entity: stringAt(entry, 'entity') ?? '' };
    const walker = new ViewWalker();
    for (const field of ['label', 'visibleIf']) walker.value(entry[field] ?? null, `${path}.${field}`, item, 0);
    walker.action(Object.fromEntries(Object.entries(entry).filter(([key]) => actionFields.includes(key))), path, item, 0);
    return { kind: 'action', id: stringAt(entry, 'id') ?? '', path, entry, facts: walker.facts, item, aliases: undefined, reads: [] };
  });
}

function componentSites(manifest: Manifest): UiSite[] {
  return uiEntries(manifest, 'components').flatMap((entry, index): UiSite[] => {
    if (entry['widget'] !== undefined) return [];
    const path = `ui.components.${index}`;
    return [{ kind: 'component', id: stringAt(entry, 'id') ?? '', path, entry, facts: walk(entry, path, ['view'], unchecked), aliases: undefined, reads: [] }];
  });
}

function slashReads(facts: readonly ViewFact[]): SiteQuery[] {
  return facts.flatMap((fact): SiteQuery[] => {
    if (fact.kind !== 'node' || fact.type !== 'composer') return [];
    const slash = objectOf(fact.node['slash']);
    const query = stringAt(slash, 'query');
    return query === undefined ? [] : [{ query, payload: slash?.['payload'], path: `${fact.path}.slash.query`, payloadPath: `${fact.path}.slash.payload` }];
  });
}

// A preset's own pages (07 §7.3): entries named `name`, with the id `preset.<name>`.
export function presetPageSites(pages: readonly JsonObject[]): UiSite[] {
  return pages.map((entry, index) => {
    const path = `pages.${index}`;
    const declared = declaredQueries(entry, path);
    const facts = walk(entry, path, ['title', 'view'], unchecked);
    return {
      kind: 'page', id: `preset.${stringAt(entry, 'name') ?? ''}`, path, entry, facts,
      aliases: entry['queries'] === undefined ? undefined : declared.aliases, reads: [...declared.reads, ...slashReads(facts)],
    };
  });
}

// Every view-bearing registration of a manifest, walked.
export function uiSites(manifest: Manifest): UiSite[] {
  const section = manifest.ui.settingsSection === null ? undefined : jsonObjectSchema.parse(manifest.ui.settingsSection);
  const settings: UiSite[] = section === undefined ? [] : [{
    kind: 'settingsSection', id: `settings.section.${manifest.meta.namespace}`, path: 'ui.settingsSection', entry: section,
    facts: walk(section, 'ui.settingsSection', ['view'], unchecked), aliases: undefined, reads: [],
  }];
  const sites = [...sources.flatMap((source) => plainSites(manifest, source)), ...actionSites(manifest), ...componentSites(manifest), ...settings];
  return sites.map((site) => ({ ...site, reads: [...site.reads, ...slashReads(site.facts)] }));
}
