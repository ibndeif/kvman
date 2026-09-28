import type { Json, JsonObject } from '@kvman/protocol';
import { arrayAt, numberAt, objectOf, stringAt } from './json-reading.ts';

export type TypeName = { name: string | undefined; kind: string | undefined };

export type UiName = { name: string | undefined; kind: string; index: number };

export type DataVersion = { version: number; compatibleWith: number[]; steps: number[] };

// The names each rule of 05 §5.3 checks, by manifest index; an entry whose name is not a string is left to the
// manifest schema's issues.
export type ManifestNames = {
  namespace: string | undefined;
  types: TypeName[];
  entities: Array<string | undefined>;
  collections: Array<string | undefined>;
  logs: Array<string | undefined>;
  schedules: Array<string | undefined>;
  errors: Array<string | undefined>;
  subscriptions: Array<string | undefined>;
  capabilities: Array<string | undefined>;
  ui: UiName[];
  dataVersion: DataVersion | undefined;
};

function namesAt(entries: Json[], key: string): Array<string | undefined> {
  return entries.map((entry) => stringAt(entry, key));
}

function numbers(values: Json[]): number[] {
  return values.filter((value): value is number => typeof value === 'number');
}

function dataVersionOf(data: Json | undefined): DataVersion | undefined {
  const version = numberAt(data, 'version');
  if (version === undefined || !Number.isInteger(version) || version < 1) return undefined;
  const steps = arrayAt(data, 'migrations').map((migration) => numberAt(migration, 'to') ?? Number.NaN);
  return { version, compatibleWith: numbers(arrayAt(data, 'compatibleWith')), steps };
}

// The UI arrays in manifest order; every entry is keyed `id` (05 §5.3).
const uiKinds = [
  'pages', 'navGroups', 'navItems', 'toolbarItems', 'statusItems', 'panels', 'slots', 'actions', 'rendererTargets',
  'renderers', 'components',
] as const;

function uiNamesOf(ui: JsonObject | undefined): UiName[] {
  return uiKinds.flatMap((kind) => arrayAt(ui, kind).map((entry, index) => ({ name: stringAt(entry, 'id'), kind, index })));
}

export function manifestNames(manifest: JsonObject): ManifestNames {
  const data = objectOf(manifest['data']);
  return {
    namespace: stringAt(manifest['meta'], 'namespace'),
    types: arrayAt(manifest, 'types').map((entry) => ({ name: stringAt(entry, 'type'), kind: stringAt(entry, 'kind') })),
    entities: namesAt(arrayAt(manifest, 'entities'), 'name'),
    collections: namesAt(arrayAt(data, 'collections'), 'name'),
    logs: namesAt(arrayAt(data, 'logs'), 'prefix'),
    schedules: namesAt(arrayAt(manifest, 'schedules'), 'name'),
    errors: namesAt(arrayAt(manifest, 'errors'), 'code'),
    subscriptions: namesAt(arrayAt(manifest, 'subscriptions'), 'event'),
    capabilities: namesAt(arrayAt(manifest['permissions'], 'capabilities'), 'name'),
    ui: uiNamesOf(objectOf(manifest['ui'])),
    dataVersion: dataVersionOf(data),
  };
}
