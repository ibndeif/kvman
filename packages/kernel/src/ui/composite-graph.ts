// 08 §8.9 "Limits": composites cannot reference themselves, directly or through other extensions' components, and at
// most 8 composite levels are nested. The graph maps each composite to the composites its view uses.
export const maxCompositeLevels = 8;

export type CompositeGraph = ReadonlyMap<string, readonly string[]>;

function usedComposites(graph: CompositeGraph, name: string): string[] {
  return (graph.get(name) ?? []).filter((used) => graph.has(used));
}

// Each cycle once, as the path that closes it (`a → b → a`), in graph order.
export function compositeCycles(graph: CompositeGraph): string[][] {
  const cycles: string[][] = [];
  const reported = new Set<string>();
  const done = new Set<string>();
  const visit = (name: string, trail: readonly string[]): void => {
    const start = trail.indexOf(name);
    if (start !== -1) {
      const members = trail.slice(start);
      const key = [...members].sort().join('\n');
      if (!reported.has(key)) {
        reported.add(key);
        cycles.push([...members, name]);
      }
      return;
    }
    if (done.has(name)) return;
    for (const used of usedComposites(graph, name)) visit(used, [...trail, name]);
    done.add(name);
  };
  for (const name of graph.keys()) visit(name, []);
  return cycles;
}

// The levels each composite's view nests: 1 for one using no other composite. An edge back into the path being
// walked counts nothing: that cycle is reported by compositeCycles.
export function compositeDepths(graph: CompositeGraph): Map<string, number> {
  const depths = new Map<string, number>();
  const walking = new Set<string>();
  const depthOf = (name: string): number => {
    const known = depths.get(name);
    if (known !== undefined) return known;
    walking.add(name);
    const inner = usedComposites(graph, name).filter((used) => !walking.has(used)).map(depthOf);
    walking.delete(name);
    const depth = 1 + Math.max(0, ...inner);
    depths.set(name, depth);
    return depth;
  };
  for (const name of graph.keys()) depthOf(name);
  return depths;
}
