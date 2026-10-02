import type { Json } from '@kvman/sdk';
import type { InjectionKey, Ref } from 'vue';
import type { Values } from './views.ts';

// References in view inputs and params (plan 06 §6.3–§6.4): `{ $param: name }` (a route param), `{ $row: field }` (the
// current row), and `{ $output: field }` (a command's or status query's output; `field` may be a dotted path, and a
// status param may add `format`, ADR 0009, 146). There is no expression language.

export type Scope = { params?: Readonly<Record<string, string>>; row?: Json; output?: Json };

// The scope of the custom component around a `kvman.View`, so its tree resolves the same references.
export const viewScopeKey: InjectionKey<Readonly<Ref<Scope>>> = Symbol('kvwebui-view-scope');

type Kind = '$param' | '$row' | '$output';

function field(source: Json | undefined, name: string): Json {
  let found: Json = source ?? null;
  for (const key of name.split('.')) {
    if (typeof found !== 'object' || found === null || Array.isArray(found)) return null;
    found = found[key] ?? null;
  }
  return found;
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

/** The names of the route params a tree references. */
export function paramNames(tree: unknown): string[] {
  if (Array.isArray(tree)) return tree.flatMap(paramNames);
  if (typeof tree !== 'object' || tree === null) return [];
  const entries = Object.entries(tree);
  const [key, name] = entries[0] ?? [];
  if (entries.length === 1 && key === '$param' && typeof name === 'string') return [name];
  return entries.flatMap(([, value]) => paramNames(value));
}

/** How a status param shows a number (ADR 0009, 146, 147). */
export const outputFormats = ['compact', 'usd'] as const;
export type OutputFormat = (typeof outputFormats)[number];

/** A status param `{ $output: field, format }`, or `undefined` for any other value. */
export function formattedOutput(value: Json): { name: string; format: unknown } | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const { $output: name, format, ...rest } = value;
  return typeof name === 'string' && format !== undefined && Object.keys(rest).length === 0 ? { name, format } : undefined;
}

// In RTL text the currency's letters and sign are reordered (`0.0070 US$` shows as `$US 0.0070`), so the amount is
// set apart as an LTR run (ADR 0009, 197).
const rightToLeftScripts = new Set(['Arab', 'Hebr', 'Thaa', 'Syrc', 'Nkoo', 'Adlm']);

function isolated(text: string, language: string): string {
  const script = new Intl.Locale(language).maximize().script;
  return script !== undefined && rightToLeftScripts.has(script) ? `\u2066${text}\u2069` : text;
}

function formatNumber(amount: number, format: OutputFormat, language: string): string {
  if (format === 'compact') return new Intl.NumberFormat(language, { notation: 'compact', maximumFractionDigits: 1 }).format(amount);
  const currency = { style: 'currency', currency: 'USD' } as const;
  if (amount === 0 || amount >= 0.01) return isolated(new Intl.NumberFormat(language, currency).format(amount), language);
  // Under a cent: four decimals, and one significant digit when four would show zero.
  return isolated(new Intl.NumberFormat(language, amount < 0.0001 ? { ...currency, maximumSignificantDigits: 1 } : { ...currency, minimumFractionDigits: 4 }).format(amount), language);
}

const asText = (value: Json): string => (typeof value === 'string' ? value : JSON.stringify(value));

// Params for a translated text: each value as a string, so vue-i18n fills it as is. A formatted output param shows its
// number in `language`.
export function textParams(values: Values | undefined, scope: Scope, language = 'en'): Record<string, string> {
  return Object.fromEntries(
    Object.entries(values ?? {}).map(([key, value]) => {
      const formatted = formattedOutput(value);
      const shown = formatted === undefined ? resolve(value, scope) : resolve({ $output: formatted.name }, scope);
      const format = outputFormats.find((known) => known === formatted?.format);
      return [key, typeof shown === 'number' && format !== undefined ? formatNumber(shown, format, language) : asText(shown)];
    }),
  );
}
