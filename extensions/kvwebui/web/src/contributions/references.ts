import type { Json } from '@kvman/sdk';
import type { InjectionKey, Ref } from 'vue';
import type { Values } from './views.ts';

// References in view inputs and params (plan 06 §6.3–§6.4): `{ $param: name }` (a route param), `{ $row: field }` (the
// current row), and `{ $output: field }` (a command's or status query's output). There is no expression language.

export type Scope = { params?: Readonly<Record<string, string>>; row?: Json; output?: Json };

// The scope of the custom component around a `kvman.View`, so its tree resolves the same references.
export const viewScopeKey: InjectionKey<Readonly<Ref<Scope>>> = Symbol('kvwebui-view-scope');

type Kind = '$param' | '$row' | '$output';

function field(source: Json | undefined, name: string): Json {
  if (typeof source !== 'object' || source === null || Array.isArray(source)) return null;
  return source[name] ?? null;
}

function reference(value: Json): { kind: Kind; name: string } | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const entries = Object.entries(value);
  const [key, name] = entries[0] ?? [];
  if (entries.length !== 1 || typeof name !== 'string') return undefined;
  return key === '$param' || key === '$row' || key === '$output' ? { kind: key, name } : undefined;
}

export function resolve(value: Json, scope: Scope): Json {
  const found = reference(value);
  if (found?.kind === '$param') return scope.params?.[found.name] ?? null;
  if (found?.kind === '$row') return field(scope.row, found.name);
  if (found?.kind === '$output') return field(scope.output, found.name);
  if (Array.isArray(value)) return value.map((item) => resolve(item, scope));
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => (item === undefined ? [] : [[key, resolve(item, scope)]])));
  }
  return value;
}

export function resolveValues(values: Values | undefined, scope: Scope): Record<string, Json> {
  return Object.fromEntries(Object.entries(values ?? {}).map(([key, value]) => [key, resolve(value, scope)]));
}

// Params for a translated text: each value as a string, so vue-i18n fills it as is.
export function textParams(values: Values | undefined, scope: Scope): Record<string, string> {
  return Object.fromEntries(Object.entries(resolveValues(values, scope)).map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)]));
}
