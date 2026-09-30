import type { Json } from '@kvman/sdk';
import type { RouteLocationNormalizedLoaded } from 'vue-router';
import type { NavEntry, Registry } from '../contributions/registry.ts';

// Page ids and URLs (plan 06 §6.3, ADR 0009, 69): a page's URL is `/<namespace>/<page>` followed by its params in
// order. The built-in pages are `kvwebui.settings` and `kvwebui.extensions`.

export const builtinPages: Readonly<Record<string, { path: string; title: string }>> = {
  'kvwebui.settings': { path: '/kvwebui/settings', title: 'kvwebui.pages.settings' },
  'kvwebui.extensions': { path: '/kvwebui/extensions', title: 'kvwebui.pages.extensions' },
};

export function pageLocation(registry: Registry, pageId: string, params: Readonly<Record<string, Json>>): string {
  const builtin = builtinPages[pageId];
  if (builtin !== undefined) return builtin.path;
  const dot = pageId.indexOf('.');
  const names = registry.pages.get(pageId)?.params ?? Object.keys(params);
  const values = names.map((name) => params[name] ?? null).map((value) => (typeof value === 'string' ? value : JSON.stringify(value)));
  return `/${[pageId.slice(0, dot), pageId.slice(dot + 1), ...values].map(encodeURIComponent).join('/')}`;
}

// The route's page: its id and params, or `undefined` when no loaded page matches.
export function routePage(registry: Registry, route: RouteLocationNormalizedLoaded): { id: string; params: Record<string, string> } | undefined {
  const { namespace, page, params } = route.params;
  if (typeof namespace !== 'string' || typeof page !== 'string') return undefined;
  const entry = registry.pages.get(`${namespace}.${page}`);
  const values = Array.isArray(params) ? params : [];
  if (entry === undefined || entry.params.length !== values.length) return undefined;
  return { id: entry.id, params: Object.fromEntries(entry.params.map((name, index) => [name, values[index] ?? ''])) };
}

// The nav: `kvwebui.nav.order` first, then each item's `order`, then its full id; hidden items left out (plan 06 §6.2).
export function orderedNav(nav: readonly NavEntry[], order: readonly string[], hidden: readonly string[]): NavEntry[] {
  const rank = (item: NavEntry) => (order.includes(item.id) ? order.indexOf(item.id) : order.length);
  return nav
    .filter((item) => !hidden.includes(item.id))
    .sort((first, second) => rank(first) - rank(second) || first.order - second.order || first.id.localeCompare(second.id));
}
