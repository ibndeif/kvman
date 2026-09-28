import type { Json, JsonObject, Manifest, SchemaDocument } from '@kvman/protocol';
import { uiEntries, type UiKind } from '../ui/ui-world.ts';
import { objectOf, stringAt } from '../validation/json-reading.ts';
import type { ComponentEntry } from './schema-components.ts';

type Contribution = SchemaDocument['contributions'][number];

// Each UI array as the kind `/schema` names it, and the field its `target` shows (ADR 0158).
const listed: ReadonlyArray<{ ui: UiKind; kind: Contribution['kind']; target?: string; schema?: string }> = [
  { ui: 'pages', kind: 'page', target: 'route' },
  { ui: 'navGroups', kind: 'navGroup' },
  { ui: 'navItems', kind: 'navItem', target: 'page' },
  { ui: 'toolbarItems', kind: 'toolbarItem', target: 'slot' },
  { ui: 'statusItems', kind: 'statusItem' },
  { ui: 'panels', kind: 'panel', target: 'slot' },
  { ui: 'actions', kind: 'action', target: 'entity' },
  { ui: 'renderers', kind: 'renderer', target: 'target' },
  { ui: 'slots', kind: 'slot', schema: 'props' },
  { ui: 'rendererTargets', kind: 'rendererTarget', schema: 'item' },
];

function contribution(entry: JsonObject, owner: string, source: (typeof listed)[number]): Contribution {
  const target = source.target === undefined ? undefined : stringAt(entry, source.target);
  const schema = source.schema === undefined ? undefined : objectOf(entry[source.schema]);
  return {
    id: stringAt(entry, 'id') ?? '', kind: source.kind, owner, description: stringAt(entry, 'description') ?? '',
    ...(target === undefined ? {} : { target }), ...(schema === undefined ? {} : { schema }),
  };
}

// ADR 0158: every UI entry of the listed extensions, with its settings section.
export function contributionListings(manifests: readonly Manifest[]): Contribution[] {
  return manifests.flatMap((manifest) => {
    const owner = manifest.meta.name;
    const entries = listed.flatMap((source) => uiEntries(manifest, source.ui).map((entry) => contribution(entry, owner, source)));
    const section = manifest.ui.settingsSection;
    const settings: Contribution[] = section === null ? [] : [{ id: `settings.section.${manifest.meta.namespace}`, kind: 'settingsSection', owner, description: section.description }];
    return [...entries, ...settings];
  });
}

// A composite's `z.action()` props are its events (08 §8.9, ADR 0023).
function eventsOf(props: JsonObject): ComponentEntry['events'] {
  const properties = objectOf(props['properties']) ?? {};
  return Object.fromEntries(Object.entries(properties).flatMap(([name, schema]) => {
    const property = objectOf(schema);
    if (stringAt(property, 'format') !== 'kvman-action') return [];
    return [[name, { description: stringAt(property, 'description') ?? name }]];
  }));
}

function childrenOf(entry: JsonObject): ComponentEntry['children'] {
  const rule = entry['children'];
  if (entry['widget'] !== undefined) return 'none';
  if (rule === 'any') return 'any';
  return Array.isArray(rule) ? rule.filter((name): name is string => typeof name === 'string') : 'none';
}

function examplesOf(entry: JsonObject): Json[] {
  const examples = entry['examples'];
  return Array.isArray(examples) ? examples : [];
}

// ADR 0158: the listed extensions' public composites and widgets; private ones are only their owner's.
export function extensionComponentEntries(manifests: readonly Manifest[]): ComponentEntry[] {
  return manifests.flatMap((manifest) => uiEntries(manifest, 'components').flatMap((entry): ComponentEntry[] => {
    if (entry['visibility'] !== 'public') return [];
    const props = objectOf(entry['props']) ?? {};
    return [{
      name: stringAt(entry, 'id') ?? '', owner: manifest.meta.name, form: entry['widget'] === undefined ? 'composite' : 'widget',
      description: stringAt(entry, 'description') ?? '', props, events: eventsOf(props), children: childrenOf(entry), examples: examplesOf(entry),
    }];
  }));
}
