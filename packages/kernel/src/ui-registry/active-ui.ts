import { frameSlots, jsonObjectSchema, type Json, type JsonObject, type Manifest, type Preset } from '@kvman/protocol';
import { uiEntries } from '../ui/ui-world.ts';
import { stringAt } from '../validation/json-reading.ts';

// A registered entry's definition as the registry serves it: without the `id` (an extension's) or `name` (a
// preset's) that its item carries separately (ADR 0159).
export function definitionOf(entry: JsonObject, identity: 'id' | 'name'): JsonObject {
  return Object.fromEntries(Object.entries(entry).filter(([key]) => key !== identity));
}

export function presetEntries(entries: readonly unknown[] | undefined): JsonObject[] {
  return (entries ?? []).map((entry) => jsonObjectSchema.parse(entry));
}

// What the registry's items are checked against in one workspace: the active manifests and the applied preset.
export class ActiveUi {
  readonly manifests: readonly Manifest[];
  readonly preset: Preset;
  readonly #hidden: ReadonlySet<string>;
  readonly #slots: ReadonlySet<string>;
  readonly #entities: ReadonlySet<string>;
  readonly #targets: ReadonlySet<string>;
  readonly #pages: ReadonlySet<string>;

  constructor(manifests: readonly Manifest[], preset: Preset) {
    this.manifests = manifests;
    this.preset = preset;
    this.#hidden = new Set(preset.hidden ?? []);
    const ids = (kind: 'slots' | 'rendererTargets' | 'pages'): string[] => manifests.flatMap((manifest) => uiEntries(manifest, kind).map((entry) => stringAt(entry, 'id') ?? ''));
    this.#slots = new Set([...frameSlots.map((slot) => slot.name), ...ids('slots')]);
    this.#entities = new Set(manifests.flatMap((manifest) => manifest.entities.map((entity) => entity.name)));
    this.#targets = new Set(ids('rendererTargets'));
    this.#pages = new Set([...ids('pages'), ...presetEntries(preset.pages).map((entry) => `preset.${stringAt(entry, 'name') ?? ''}`)]);
  }

  isHidden(id: string): boolean {
    return this.#hidden.has(id);
  }

  hasSlot(name: string): boolean {
    return this.#slots.has(name);
  }

  // 08 §8.4: a renderer's target is an entity, a target an active extension declares, or any MIME type.
  hasTarget(target: string): boolean {
    if (target.startsWith('entity:')) return this.#entities.has(target.slice('entity:'.length));
    return target.startsWith('mime:') || this.#targets.has(target);
  }

  hasEntity(name: string): boolean {
    return this.#entities.has(name);
  }

  // Hiding a page hides every nav item that opens it (08 §8.4).
  opensVisiblePage(page: string | undefined): boolean {
    return page !== undefined && this.#pages.has(page) && !this.#hidden.has(page);
  }

  // The preset's label for an id, exactly as written (ADR 0159).
  labelOf(id: string): Json | undefined {
    return this.preset.labels?.[id];
  }

  // An item as the registry lists it, with the preset's label beside its definition.
  item(id: string, owner: string, kind: string, def: JsonObject): JsonObject {
    const label = this.labelOf(id);
    return { id, owner, kind, def, ...(label === undefined ? {} : { label }) };
  }
}
