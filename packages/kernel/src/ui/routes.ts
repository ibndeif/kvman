import type { Issue } from '@kvman/protocol';

// 06 §6.3 "Routes": a route starts with `/` and holds only lowercase segments and `:param` segments.
const literalSegment = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const paramSegment = /^:[A-Za-z][A-Za-z0-9_]*$/;
const interpolatedSegment = /^\{\{\s*[^{}]+?\s*\}\}$/;
const reservedPrefixes = ['/_kvman', '/api'];

export type RouteSegment = { kind: 'literal'; text: string } | { kind: 'param'; name: string };

function segmentsOf(route: string): string[] {
  return route === '/' ? [] : route.slice(1).split('/');
}

export function routeIssues(route: string, path: string): Issue[] {
  const reserved = reservedPrefixes.find((prefix) => route === prefix || route.startsWith(`${prefix}/`));
  if (reserved !== undefined) {
    return [{ path, message: `routes under ${reserved} belong to kvman`, hint: 'choose a route that does not start with /_kvman or /api' }];
  }
  if (!route.startsWith('/') || (route !== '/' && route.endsWith('/'))) {
    return [{ path, message: `"${route}" is not a route`, hint: 'write a route such as "/files" or "/files/:fileId"' }];
  }
  const bad = segmentsOf(route).find((segment) => !literalSegment.test(segment) && !paramSegment.test(segment));
  if (bad === undefined) return [];
  return [{ path, message: `"${bad}" is not a route segment`, hint: 'use lowercase words joined by "-", or a ":param"' }];
}

// Only for routes without issues.
export function routePattern(route: string): RouteSegment[] {
  return segmentsOf(route).map((segment) => (segment.startsWith(':') ? { kind: 'param', name: segment.slice(1) } : { kind: 'literal', text: segment }));
}

// Two routes clash when some URL opens both: a `:param` matches any segment (06 §6.3).
export function routesClash(left: string, right: string): boolean {
  const first = routePattern(left);
  const second = routePattern(right);
  if (first.length !== second.length) return false;
  return first.every((segment, index) => {
    const other = second[index];
    if (other === undefined) return false;
    return segment.kind === 'param' || other.kind === 'param' || segment.text === other.text;
  });
}

// `05` §5.3: an entity's route (`/files/{{ $item.id }}`) fills a page route's `:params` with its interpolations.
export function entityRouteMatches(entityRoute: string, pageRoute: string): boolean {
  const filled = segmentsOf(entityRoute);
  const pattern = routePattern(pageRoute);
  if (filled.length !== pattern.length) return false;
  return filled.every((segment, index) => {
    const target = pattern[index];
    if (target === undefined) return false;
    if (interpolatedSegment.test(segment)) return target.kind === 'param';
    return target.kind === 'literal' ? target.text === segment : literalSegment.test(segment);
  });
}

// The `:params` of a route, for `$route.*` bindings.
export function routeParams(route: string): string[] {
  return routePattern(route).flatMap((segment) => (segment.kind === 'param' ? [segment.name] : []));
}
