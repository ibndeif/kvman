import { builtinComponents } from '@kvman/protocol';
import type { UiSite } from '../ui/ui-sites.ts';
import { arrayAt, stringAt } from '../validation/json-reading.ts';

const columnForms: ReadonlySet<string> = new Set(['text', 'badge', 'liveText', 'progress']);

// The extension components a site's views use: node types that are not built in, and table columns shown `as` a
// component (08 §8.5).
function componentsUsed(site: UiSite): string[] {
  return site.facts.flatMap((fact) => {
    if (fact.kind !== 'node') return [];
    const node = builtinComponents.has(fact.type) ? [] : [fact.type];
    const columns = fact.type !== 'table' ? [] : arrayAt(fact.node, 'columns').flatMap((column) => {
      const shown = stringAt(column, 'as');
      return shown === undefined || columnForms.has(shown) ? [] : [shown];
    });
    return [...node, ...columns];
  });
}

// Every composite the given sites use, and those their views use, transitively (ADR 0159). `composites` holds the
// composite sites of the active extensions, by name; widgets are not composites.
export function compositesUsedBy(sites: readonly UiSite[], composites: ReadonlyMap<string, UiSite>): Set<string> {
  const found = new Set<string>();
  const pending = sites.flatMap(componentsUsed);
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    const composite = composites.get(next);
    if (composite === undefined || found.has(next)) continue;
    found.add(next);
    pending.push(...componentsUsed(composite));
  }
  return found;
}
