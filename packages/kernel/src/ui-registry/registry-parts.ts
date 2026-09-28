import { jsonObjectSchema, type Json, type JsonObject, type Manifest } from '@kvman/protocol';
import { uiEntries } from '../ui/ui-world.ts';
import { stringAt } from '../validation/json-reading.ts';
import { definitionOf, presetEntries, type ActiveUi } from './active-ui.ts';
import { compareText } from './registry-sources.ts';

function optional(key: string, value: Json | undefined): JsonObject {
  return value === undefined ? {} : { [key]: value };
}

function pageOf(ui: ActiveUi, entry: JsonObject, id: string, owner: string): JsonObject {
  return {
    id, owner, route: entry['route'] ?? '', title: entry['title'] ?? '', ...optional('icon', entry['icon']),
    hidden: ui.isHidden(id), ...optional('label', ui.labelOf(id)),
  };
}

// Every page of the active extensions and the preset, hidden ones included for "Show hidden pages" (08 §8.6).
export function registryPages(ui: ActiveUi): JsonObject[] {
  const own = ui.manifests.flatMap((manifest) => uiEntries(manifest, 'pages').map((entry) => pageOf(ui, entry, stringAt(entry, 'id') ?? '', manifest.meta.name)));
  const preset = presetEntries(ui.preset.pages).map((entry) => pageOf(ui, entry, `preset.${stringAt(entry, 'name') ?? ''}`, 'preset'));
  return [...own, ...preset].sort((left, right) => compareText(stringAt(left, 'id') ?? '', stringAt(right, 'id') ?? ''));
}

// Actions by entity, renderers by target: those of active owners that are not hidden, by owner then id.
export function attachedItems(ui: ActiveUi, kind: 'actions' | 'renderers'): JsonObject {
  const groups = new Map<string, JsonObject[]>();
  for (const manifest of ui.manifests) {
    for (const entry of uiEntries(manifest, kind)) {
      const id = stringAt(entry, 'id') ?? '';
      const key = (kind === 'actions' ? stringAt(entry, 'entity') : stringAt(entry, 'target')) ?? '';
      const attached = kind === 'actions' ? ui.hasEntity(key) : ui.hasTarget(key);
      if (!attached || ui.isHidden(id)) continue;
      groups.set(key, [...(groups.get(key) ?? []), ui.item(id, manifest.meta.name, kind === 'actions' ? 'action' : 'renderer', definitionOf(entry, 'id'))]);
    }
  }
  return Object.fromEntries([...groups].sort(([left], [right]) => compareText(left, right)));
}

// Every component of the active extensions; a composite used outside pages carries its definition (ADR 0159).
export function registryComponents(ui: ActiveUi, withDefinition: ReadonlySet<string>): JsonObject[] {
  return ui.manifests.flatMap((manifest) => uiEntries(manifest, 'components').map((entry): JsonObject => {
    const name = stringAt(entry, 'id') ?? '';
    const form = entry['widget'] === undefined ? 'composite' : 'widget';
    return {
      name, owner: manifest.meta.name, form, visibility: stringAt(entry, 'visibility') ?? 'private',
      ...(form === 'composite' && withDefinition.has(name) ? { def: definitionOf(entry, 'id') } : {}),
    };
  })).sort((left, right) => compareText(stringAt(left, 'name') ?? '', stringAt(right, 'name') ?? ''));
}

export function registryExtensions(ui: ActiveUi): JsonObject {
  return Object.fromEntries(ui.manifests.map((manifest) => [
    manifest.meta.name, { namespace: manifest.meta.namespace, title: manifest.meta.title, ...optional('icon', manifest.meta.icon) },
  ]));
}

function sectionOf(ui: ActiveUi, manifest: Manifest, config: NonNullable<Manifest['config']>): JsonObject {
  const id = `settings.section.${manifest.meta.namespace}`;
  const view = manifest.ui.settingsSection === null ? undefined : jsonObjectSchema.parse(manifest.ui.settingsSection)['view'];
  return {
    id, owner: manifest.meta.name, title: manifest.meta.title,
    scopes: config.scope === 'both' ? ['global', 'workspace'] : [config.scope], schema: config.schema,
    ...optional('view', view), ...optional('label', ui.labelOf(id)),
  };
}

// One section per active extension with config (08 §8.4), its registered view replacing the generated form.
export function registrySections(ui: ActiveUi): JsonObject[] {
  return ui.manifests.flatMap((manifest) => {
    const { config } = manifest;
    if (config === null || ui.isHidden(`settings.section.${manifest.meta.namespace}`)) return [];
    return [sectionOf(ui, manifest, config)];
  });
}

export function registryCatalogs(ui: ActiveUi): JsonObject {
  const owners = [...ui.manifests.map((manifest) => [manifest.meta.name, manifest.translations] as const), ['preset', ui.preset.translations ?? null] as const];
  const defaults: JsonObject = {};
  const locales = new Set<string>();
  for (const [owner, translations] of owners) {
    if (translations === null) continue;
    defaults[owner] = translations.default;
    for (const locale of Object.keys(translations.catalogs)) locales.add(locale);
  }
  return { defaults, locales: [...locales].sort(compareText) };
}
