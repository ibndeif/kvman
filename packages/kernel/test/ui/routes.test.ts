import { entityRouteMatches, routeIssues, routeParams, routesClash } from '../../src/ui/routes.ts';
import { describe, expect, it } from 'vitest';

describe('routes (plan 06 §6.3)', () => {
  it('M2.10-E38 params are wildcards when clashing, and entity routes fill them', () => {
    expect(routesClash('/files/:a', '/files/:b')).toBe(true);
    expect(routesClash('/files/x', '/files/:id')).toBe(true);
    expect(routesClash('/files', '/files/:id')).toBe(false);
    expect(routesClash('/files/x', '/files/y')).toBe(false);
    expect(entityRouteMatches('/files/{{ $item.id }}', '/files/:fileId')).toBe(true);
    expect(entityRouteMatches('/files/x', '/files/:fileId')).toBe(true);
    expect(routeParams('/files/:fileId')).toEqual(['fileId']);
    expect(routeIssues('/files/:fileId', 'ui.pages.0.route')).toEqual([]);
  });
});
