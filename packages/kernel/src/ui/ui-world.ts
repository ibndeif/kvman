import { jsonObjectSchema, type JsonObject, type Manifest, type TypeEntry } from '@kvman/protocol';
import { kernelTypeEntries } from '../registry/kernel-types.ts';
import { objectOf, stringAt } from '../validation/json-reading.ts';
import type { TypeWorld } from './view-targets.ts';

export type Owned<Value> = { owner: Manifest; value: Value };

export type UiKind = 'pages' | 'navGroups' | 'navItems' | 'toolbarItems' | 'statusItems' | 'panels' | 'slots' | 'actions' | 'rendererTargets' | 'renderers' | 'components';

// A manifest's UI entries as JSON: the protocol checks their shapes (`uiSchema`), and the UI rules read them with
// the JSON helpers, as the other manifest rules do.
export function uiEntries(manifest: Manifest, kind: UiKind): JsonObject[] {
  return manifest.ui[kind].map((entry) => jsonObjectSchema.parse(entry));
}

function byId(manifests: readonly Manifest[], kind: UiKind): Map<string, Owned<JsonObject>> {
  return new Map(manifests.flatMap((manifest) => uiEntries(manifest, kind).map((entry) => [stringAt(entry, 'id') ?? '', { owner: manifest, value: entry }] as const)));
}

const kernelEntries = new Map(kernelTypeEntries().map((entry) => [entry.type, entry]));

// What UI names resolve to (ADR 0157). A manifest's own check sees only that manifest (`complete: false`: a foreign
// name is checked later, against the workspace); a workspace check sees every enabled manifest (`complete: true`: a
// foreign name that resolves nowhere belongs to an extension that is not enabled). `installed` names the owner of
// an inactive placement.
export class UiWorld implements TypeWorld {
  readonly complete: boolean;
  readonly manifests: readonly Manifest[];
  readonly slots: ReadonlyMap<string, Owned<JsonObject>>;
  readonly components: ReadonlyMap<string, Owned<JsonObject>>;
  readonly pages: ReadonlyMap<string, Owned<JsonObject>>;
  readonly #targets: ReadonlyMap<string, Owned<JsonObject>>;
  readonly #entities: ReadonlyMap<string, Owned<Manifest['entities'][number]>>;
  readonly #types: ReadonlyMap<string, { owner: string; entry: TypeEntry }>;
  readonly #installed: readonly Manifest[];

  constructor(manifests: readonly Manifest[], complete: boolean, installed: readonly Manifest[] = []) {
    this.complete = complete;
    this.manifests = manifests;
    this.slots = byId(manifests, 'slots');
    this.components = byId(manifests, 'components');
    this.pages = byId(manifests, 'pages');
    this.#targets = byId(manifests, 'rendererTargets');
    this.#entities = new Map(manifests.flatMap((manifest) => manifest.entities.map((entity) => [entity.name, { owner: manifest, value: entity }] as const)));
    this.#types = new Map(manifests.flatMap((manifest) => manifest.types.map((entry) => [entry.type, { owner: manifest.meta.name, entry }] as const)));
    this.#installed = installed;
  }

  resolve(type: string): { owner: string; entry: TypeEntry } | undefined {
    const kernel = kernelEntries.get(type);
    return kernel === undefined ? this.#types.get(type) : { owner: 'kernel', entry: kernel };
  }

  entitySchema(name: string): JsonObject | undefined {
    return this.#entities.get(name)?.value.schema;
  }

  hasEntity(name: string): boolean {
    return this.#entities.has(name);
  }

  targetItem(name: string): JsonObject | undefined {
    return objectOf(this.#targets.get(name)?.value['item']);
  }

  hasTarget(name: string): boolean {
    return this.#targets.has(name);
  }

  // Whether a name can be judged: always against a workspace; in a manifest's own check only its own names. A preset
  // page (no author manifest) is checked only against a workspace.
  judges(name: string, author: Manifest | undefined): boolean {
    return this.complete || (author !== undefined && name.startsWith(`${author.meta.namespace}.`));
  }

  // The installed extension owning a name's namespace, for naming the owner of an inactive placement.
  ownerOf(name: string): string {
    const namespace = name.split('.')[0] ?? name;
    return this.#installed.find((manifest) => manifest.meta.namespace === namespace)?.meta.name ?? `the extension with namespace "${namespace}"`;
  }
}
