import type { Issue, Json, JsonObject, Manifest } from '@kvman/protocol';
import { objectOf, stringAt } from '../validation/json-reading.ts';
import { compositeCycles, compositeDepths, maxCompositeLevels, type CompositeGraph } from './composite-graph.ts';
import type { UiSite } from './ui-sites.ts';
import type { UiWorld } from './ui-world.ts';
import { checkValue, type ValueChecker } from './value-checks.ts';
import type { ViewAuthor } from './view-targets.ts';
import { isBuiltin, type ViewFact } from './view-walk.ts';

type NodeFact = Extract<ViewFact, { kind: 'node' }>;

// The props a node passes to an extension component: everything but the common node fields.
const nodeFields = new Set(['type', 'id', 'visibleIf', 'children']);

function passedProps(node: JsonObject): Json {
  return Object.fromEntries(Object.entries(node).filter(([key]) => !nodeFields.has(key)));
}

function requiredComponents(author: ViewAuthor): ReadonlySet<string> | undefined {
  if (author.kind === 'preset') return undefined;
  return new Set(author.manifest.permissions.requireComponents.flatMap((requirement) => requirement.components));
}

function ownerIssue(fact: NodeFact, world: UiWorld, author: ViewAuthor): Issue | 'skip' | undefined {
  const typePath = `${fact.path}.type`;
  const own = author.kind === 'extension' && fact.type.startsWith(`${author.manifest.meta.namespace}.`);
  const required = requiredComponents(author);
  if (!own && required !== undefined && !required.has(fact.type)) {
    return { path: typePath, message: `${fact.type} is another extension's component and is not required`, hint: `add ext.requireComponents(['${fact.type}'], { reason })` };
  }
  const found = world.components.get(fact.type);
  if (found === undefined) {
    if (own) return { path: typePath, message: `no component ${fact.type} is registered`, hint: `register it with ext.registerComponent('${fact.type}', …), or use a built-in component` };
    if (!world.complete || required !== undefined) return 'skip';
    return { path: typePath, message: `no enabled extension provides the component ${fact.type}` };
  }
  if (!own && found.value['visibility'] !== 'public') return { path: typePath, message: `${fact.type} is private to ${found.owner.meta.name}` };
  return undefined;
}

function childrenIssues(fact: NodeFact, component: JsonObject): Issue[] {
  const rule = component['widget'] === undefined ? component['children'] ?? 'none' : 'none';
  const children = Array.isArray(fact.node['children']) ? fact.node['children'] : [];
  return children.flatMap((child, index): Issue[] => {
    const type = stringAt(child, 'type') ?? '';
    if (rule === 'none') return [{ path: `${fact.path}.children.${index}`, message: `${fact.type} takes no children` }];
    if (rule === 'any' || !Array.isArray(rule) || rule.includes(type)) return [];
    return [{ path: `${fact.path}.children.${index}.type`, message: `${fact.type} accepts only ${rule.join(', ')} as children` }];
  });
}

// 06 §6.3, 08 §8.9: a node's component is built in, its author's own, or a public one it requires (a preset page
// may use any public component of an enabled extension); its props fit the component's props and its children the
// component's `children` rule.
export function componentUseIssues(site: UiSite, world: UiWorld, author: ViewAuthor, values: ValueChecker | undefined): Issue[] {
  return site.facts.flatMap((fact): Issue[] => {
    if (fact.kind !== 'node' || isBuiltin(fact.type)) return [];
    const owner = ownerIssue(fact, world, author);
    if (owner === 'skip') return [];
    if (owner !== undefined) return [owner];
    const component = world.components.get(fact.type)?.value;
    if (component === undefined) return [];
    const props = objectOf(component['props']);
    const issues = props === undefined ? [] : checkValue(values, { schema: props, value: passedProps(fact.node), root: fact.path });
    return [...issues, ...childrenIssues(fact, component)];
  });
}

// 08 §8.9 "Private and public": a public composite writes no command action of its own, only passed-in actions
// (`$props.*`), `navigate`, and `openDialog` whose view has none.
export function authorityIssues(site: UiSite): Issue[] {
  if (site.kind !== 'component' || site.entry['visibility'] !== 'public') return [];
  const hint = 'take the action as a z.action() prop and bind it with "$props.<name>"';
  return site.facts.flatMap((fact): Issue[] => {
    if (fact.kind === 'node' && fact.type === 'form') return [{ path: `${fact.path}.command`, message: 'a public component cannot submit a form of its own', hint }];
    if (fact.kind !== 'action' || typeof fact.action === 'string') return [];
    const action = objectOf(fact.action) ?? {};
    if (action['navigate'] !== undefined || action['openDialog'] !== undefined) return [];
    return [{ path: fact.path, message: 'a public component cannot write an action of its own other than navigate or openDialog', hint }];
  });
}

// The composites each composite's view uses, over the given manifests' sites.
export function compositeGraph(sites: readonly UiSite[]): CompositeGraph {
  return new Map(sites.filter((site) => site.kind === 'component').map((site) => [
    site.id, site.facts.flatMap((fact) => (fact.kind === 'node' && !isBuiltin(fact.type) ? [fact.type] : [])),
  ]));
}

// 08 §8.9 "Limits": no composite reaches itself, and none nests more than 8 levels.
export function graphIssues(graph: CompositeGraph, pathOf: (component: string) => string): Issue[] {
  const cycles = compositeCycles(graph).map((cycle): Issue => ({
    path: pathOf(cycle[0] ?? ''),
    message: cycle.length === 2 ? `${cycle[0] ?? ''} uses itself` : `the composites form a cycle: ${cycle.join(' → ')}`,
    hint: 'a composite cannot contain itself, directly or through other components',
  }));
  const deep = [...compositeDepths(graph)].filter(([, depth]) => depth > maxCompositeLevels).map(([name, depth]): Issue => ({
    path: pathOf(name), message: `${name} nests ${depth} composite levels; at most ${maxCompositeLevels} are allowed`, hint: 'flatten the composites',
  }));
  return [...cycles, ...deep];
}

export function requireComponentIssues(author: Manifest, world: UiWorld): Issue[] {
  return author.permissions.requireComponents.flatMap((requirement, index) => requirement.components.flatMap((name, position): Issue[] => {
    const found = world.components.get(name);
    const path = `permissions.requireComponents.${index}.components.${position}`;
    if (found === undefined) return [{ path, message: `${name} is required, but no enabled extension provides it`, hint: `enable the extension that registers ${name}` }];
    if (found.value['visibility'] !== 'public') return [{ path, message: `${name} is required, but it is private to ${found.owner.meta.name}` }];
    return [];
  }));
}
