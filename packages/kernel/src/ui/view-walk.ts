import { builtinComponents, parseBindingPath, type BindingPath, type Json, type JsonObject } from '@kvman/protocol';
import { objectOf } from '../validation/json-reading.ts';

// What `$item` is in a part of a view (ADR 0157): an entity's record, a renderer target's item, or unknown.
export type ItemContext = { kind: 'entity'; entity: string } | { kind: 'target'; target: string } | { kind: 'unchecked' };

export type ViewFact =
  | { kind: 'node'; path: string; node: JsonObject; type: string; dialogDepth: number }
  | { kind: 'action'; path: string; action: Json; dialogDepth: number }
  | { kind: 'binding'; path: string; binding: BindingPath; item: ItemContext }
  | { kind: 'refreshOn'; path: string; pattern: string };

const actionKeys = ['command', 'navigate', 'openDialog', 'openGrantDialog', 'set'];
const interpolation = /\{\{\s*([^{}]*?)\s*\}\}/g;
// Built-in props that hold views (08 §8.8): the page header's buttons and a list's item view.
const nestedViews: ReadonlyMap<string, string> = new Map([['page', 'actions'], ['list', 'item']]);
// The props where `$item` is one record of a table or list, or the record a page shows (08 §8.8).
const recordProps: ReadonlyMap<string, readonly string[]> = new Map([
  ['table', ['columns', 'rowActions', 'onRowClick']], ['list', ['item', 'onItemClick']], ['page', ['actions']],
]);

function isAction(value: Json): boolean {
  if (typeof value === 'string') return value.startsWith('$props.');
  const object = objectOf(value);
  return object !== undefined && actionKeys.some((key) => object[key] !== undefined);
}

function join(path: string, key: string | number): string {
  return path === '' ? String(key) : `${path}.${key}`;
}

// Walks one view tree and reports its nodes, actions, bindings, and refreshOn patterns with their paths. Conditions'
// keys are bindings too. A `table` or `list` with `entity` makes `$item` that entity inside its columns and items.
export class ViewWalker {
  readonly facts: ViewFact[] = [];

  node(value: Json, path: string, item: ItemContext, dialogDepth: number): void {
    const node = objectOf(value);
    const type = node?.['type'];
    if (node === undefined || typeof type !== 'string') return;
    this.facts.push({ kind: 'node', path, node, type, dialogDepth });
    const inner = this.#itemInside(type, node, item);
    for (const [key, prop] of Object.entries(node)) {
      if (key === 'type') continue;
      const at = join(path, key);
      const scoped = recordProps.get(type)?.includes(key) === true ? inner : item;
      if (key === 'children' && Array.isArray(prop)) prop.forEach((child, index) => this.node(child, join(at, index), item, dialogDepth));
      else if (nestedViews.get(type) === key) this.#nested(prop, at, scoped, dialogDepth);
      else this.value(prop, at, scoped, dialogDepth);
    }
  }

  // Any JSON inside a view: actions, conditions, bound strings, and plain values.
  value(value: Json, path: string, item: ItemContext, dialogDepth: number): void {
    if (typeof value === 'string') {
      this.#bindings(value, path, item);
      if (isAction(value)) this.facts.push({ kind: 'action', path, action: value, dialogDepth });
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((entry, index) => this.value(entry, join(path, index), item, dialogDepth));
      return;
    }
    const object = objectOf(value);
    if (object === undefined) return;
    if (isAction(object)) {
      this.action(object, path, item, dialogDepth);
      return;
    }
    for (const [key, entry] of Object.entries(object)) {
      if (key.startsWith('$')) this.#bindings(key, join(path, key), item);
      this.value(entry, join(path, key), item, dialogDepth);
    }
  }

  action(action: JsonObject, path: string, item: ItemContext, dialogDepth: number): void {
    this.facts.push({ kind: 'action', path, action, dialogDepth });
    for (const [key, entry] of Object.entries(action)) {
      const at = join(path, key);
      const dialog = key === 'openDialog' ? objectOf(entry) : undefined;
      const grant = key === 'openGrantDialog' ? objectOf(entry) : undefined;
      if (dialog !== undefined) {
        this.value(dialog['title'] ?? null, join(at, 'title'), item, dialogDepth);
        this.node(dialog['view'] ?? null, join(at, 'view'), item, dialogDepth + 1);
      } else if (grant !== undefined) {
        // The grant dialog names the command it confirms (08 §8.13); that is not a command action of the view.
        this.value(grant['payload'] ?? null, join(at, 'payload'), item, dialogDepth);
      } else {
        this.value(entry, at, item, dialogDepth);
      }
    }
  }

  // A page, panel, toolbar item, or status item declares queries; `refreshOn` entries are event patterns.
  queries(queries: Json | undefined, path: string, item: ItemContext): void {
    for (const [alias, declared] of Object.entries(objectOf(queries) ?? {})) {
      const at = join(path, alias);
      const query = objectOf(declared);
      if (query === undefined) continue;
      this.value(query['payload'] ?? null, join(at, 'payload'), item, 0);
      const refreshOn = query['refreshOn'];
      if (Array.isArray(refreshOn)) {
        refreshOn.forEach((pattern, index) => {
          if (typeof pattern === 'string') this.facts.push({ kind: 'refreshOn', path: join(join(at, 'refreshOn'), index), pattern });
        });
      }
    }
  }

  #nested(value: Json, path: string, item: ItemContext, dialogDepth: number): void {
    if (Array.isArray(value)) value.forEach((entry, index) => this.node(entry, join(path, index), item, dialogDepth));
    else this.node(value, path, item, dialogDepth);
  }

  #itemInside(type: string, node: JsonObject, item: ItemContext): ItemContext {
    const entity = node['entity'];
    if (type === 'page') return typeof entity === 'string' ? { kind: 'entity', entity } : item;
    if (type !== 'table' && type !== 'list') return item;
    return typeof entity === 'string' ? { kind: 'entity', entity } : { kind: 'unchecked' };
  }

  #bindings(text: string, path: string, item: ItemContext): void {
    const whole = text.startsWith('$') && !text.startsWith('$$') ? [text] : [];
    const inner = [...text.matchAll(interpolation)].map((match) => match[1] ?? '');
    for (const candidate of [...whole, ...inner]) {
      const parsed = parseBindingPath(candidate);
      if (parsed.ok) this.facts.push({ kind: 'binding', path, binding: parsed.path, item });
    }
  }
}

export function isBuiltin(type: string): boolean {
  return builtinComponents.has(type);
}
