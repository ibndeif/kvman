import type { Json, JsonObject } from '@kvman/protocol';
import type { Ext, PageDef } from '@kvman/sdk';
import { reference, type Recording, type Schema } from './recording.ts';

function isObject(value: Json | undefined): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// A params map is a plain object of type names; anything else is a Zod schema to convert.
function isParamsMap(params: Schema | Record<string, string>): params is Record<string, string> {
  if (typeof params !== 'object' || params === null) return false;
  const prototype: unknown = Object.getPrototypeOf(params);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Object.values(params).every((value) => typeof value === 'string');
}

const paramsMessage = 'page params are an object of string, number, or boolean fields';
const paramsHint = 'declare route and search params as flat string, number, or boolean fields';

// A page's params as a map are kept as is; a Zod object of flat fields is recorded in the map form of 08 §8.5.
function pageParams(recording: Recording, index: number, params: PageDef['params']): JsonObject | undefined {
  if (params === undefined) return undefined;
  const path = `ui.pages.${index}.params`;
  if (isParamsMap(params)) return params;
  const fail = (): undefined => {
    recording.issues.push({ path, message: paramsMessage, hint: paramsHint });
    return undefined;
  };
  const converted = recording.jsonSchema(path, params, 'input');
  if (converted === undefined || converted['type'] !== 'object' || !isObject(converted['properties'])) return fail();
  const recorded: Record<string, Json> = {};
  for (const [field, property] of Object.entries(converted['properties'])) {
    if (!isObject(property)) return fail();
    const type = property['type'];
    if (type === 'integer') recorded[field] = 'number';
    else if (type === 'string' || type === 'number' || type === 'boolean') recorded[field] = type;
    else return fail();
  }
  return recorded;
}

function record(entries: JsonObject[], entry: JsonObject | undefined): void {
  if (entry !== undefined) entries.push(entry);
}

function schemaField(recording: Recording, path: string, schema: Schema | undefined, view: 'input' | 'output' = 'input'): JsonObject | undefined {
  return schema === undefined ? undefined : recording.jsonSchema(path, schema, view);
}

// The UI register* calls as the UI part of Ext, spread into the recording ext (05 §5.3, 08 §8.5, §8.9).
export function uiRegistrations(
  recording: Recording,
  open: () => void,
): Pick<
  Ext,
  'registerPage' | 'registerNavGroup' | 'registerNavItem' | 'registerToolbarItem' | 'registerStatusItem' | 'registerPanel' |
  'registerSlot' | 'registerAction' | 'registerRendererTarget' | 'registerRenderer' | 'registerComponent' | 'registerSettingsSection'
> {
  return {
    registerPage(name, definition) {
      open();
      const index = recording.pages.length;
      record(recording.pages, recording.jsonEntry(`ui.pages.${recording.pages.length}`, {
        id: name, description: definition.description, route: definition.route, title: definition.title,
        icon: definition.icon, params: pageParams(recording, index, definition.params),
        state: definition.state, queries: definition.queries, view: definition.view,
      }));
      return reference(name);
    },
    registerNavGroup(name, definition) {
      open();
      record(recording.navGroups, recording.jsonEntry(`ui.navGroups.${recording.navGroups.length}`, {
        id: name, description: definition.description, label: definition.label, icon: definition.icon, order: definition.order,
      }));
      return reference(name);
    },
    registerNavItem(name, definition) {
      open();
      record(recording.navItems, recording.jsonEntry(`ui.navItems.${recording.navItems.length}`, {
        id: name, description: definition.description, page: definition.page, label: definition.label, icon: definition.icon,
        group: definition.group, order: definition.order, badge: definition.badge,
      }));
      return reference(name);
    },
    registerToolbarItem(name, definition) {
      open();
      record(recording.toolbarItems, recording.jsonEntry(`ui.toolbarItems.${recording.toolbarItems.length}`, {
        id: name, description: definition.description, slot: definition.slot, as: definition.as, label: definition.label,
        icon: definition.icon, order: definition.order, queries: definition.queries, visibleIf: definition.visibleIf,
        action: definition.action, items: definition.items, badge: definition.badge,
      }));
      return reference(name);
    },
    registerStatusItem(name, definition) {
      open();
      record(recording.statusItems, recording.jsonEntry(`ui.statusItems.${recording.statusItems.length}`, {
        id: name, description: definition.description, side: definition.side, label: definition.label, icon: definition.icon,
        tone: definition.tone, order: definition.order, queries: definition.queries, visibleIf: definition.visibleIf,
        action: definition.action,
      }));
      return reference(name);
    },
    registerPanel(name, definition) {
      open();
      record(recording.panels, recording.jsonEntry(`ui.panels.${recording.panels.length}`, {
        id: name, description: definition.description, slot: definition.slot, title: definition.title, order: definition.order,
        queries: definition.queries, visibleIf: definition.visibleIf, view: definition.view,
      }));
      return reference(name);
    },
    registerSlot(name, definition) {
      open();
      const index = recording.slots.length;
      record(recording.slots, recording.jsonEntry(`ui.slots.${recording.slots.length}`, {
        id: name, description: definition.description, accepts: definition.accepts,
        props: schemaField(recording, `ui.slots.${index}.props`, definition.props),
        layout: definition.layout, max: definition.max,
      }));
      return reference(name);
    },
    registerAction(name, definition) {
      open();
      const { description, entity, label, icon, visibleIf, placement, ...action } = definition;
      record(recording.actions, recording.jsonEntry(`ui.actions.${recording.actions.length}`, { id: name, description, entity, label, icon, visibleIf, placement, ...action }));
      return reference(name);
    },
    registerRendererTarget(name, definition) {
      open();
      const index = recording.rendererTargets.length;
      record(recording.rendererTargets, recording.jsonEntry(`ui.rendererTargets.${recording.rendererTargets.length}`, {
        id: name, description: definition.description,
        item: schemaField(recording, `ui.rendererTargets.${index}.item`, definition.item, 'output'),
      }));
      return reference(name);
    },
    registerRenderer(name, definition) {
      open();
      record(recording.renderers, recording.jsonEntry(`ui.renderers.${recording.renderers.length}`, {
        id: name, description: definition.description, target: definition.target, view: definition.view,
        component: definition.component, props: definition.props,
      }));
      return reference(name);
    },
    registerComponent(name, definition) {
      open();
      const index = recording.components.length;
      record(recording.components, recording.jsonEntry(`ui.components.${recording.components.length}`, {
        id: name, description: definition.description,
        props: schemaField(recording, `ui.components.${index}.props`, definition.props),
        ...('widget' in definition
          ? { widget: definition.widget, visibility: definition.visibility }
          : { view: definition.view, children: definition.children, visibility: definition.visibility, examples: definition.examples }),
      }));
      return reference(name);
    },
    registerSettingsSection(definition) {
      open();
      if (!recording.firstCall('registerSettingsSection', 'ui.settingsSection')) return;
      recording.settingsSection = recording.jsonEntry('ui.settingsSection', { description: definition.description, view: definition.view }) ?? null;
    },
  };
}
