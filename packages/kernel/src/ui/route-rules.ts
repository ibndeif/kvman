import type { Issue, Manifest } from '@kvman/protocol';
import { stringAt } from '../validation/json-reading.ts';
import { routeIssues, routesClash } from './routes.ts';
import { uiEntries } from './ui-world.ts';

// An active page of a workspace, an enabled extension's or the preset's, with where its route is written.
export type ActivePage = { id: string; route: string; path: string };

export function manifestPages(manifest: Manifest, prefix = ''): ActivePage[] {
  return uiEntries(manifest, 'pages').map((page, index) => ({
    id: stringAt(page, 'id') ?? '', route: stringAt(page, 'route') ?? '', path: `${prefix}ui.pages.${index}.route`,
  }));
}

export function routeFormIssues(pages: readonly ActivePage[]): Issue[] {
  return pages.flatMap((page) => routeIssues(page.route, page.path));
}

// 06 §6.3 "Routes": active pages have unique routes once each `:param` is a wildcard. A clash is reported at the
// later page, naming both.
export function routeClashIssues(pages: readonly ActivePage[]): Issue[] {
  const valid = pages.filter((page) => routeIssues(page.route, page.path).length === 0);
  return valid.flatMap((page, index): Issue[] => {
    const earlier = valid.slice(0, index).find((other) => routesClash(other.route, page.route));
    if (earlier === undefined) return [];
    return [{ path: page.path, message: `${earlier.id} (${earlier.route}) and ${page.id} (${page.route}) open on the same route`, hint: 'change one of the routes' }];
  });
}
