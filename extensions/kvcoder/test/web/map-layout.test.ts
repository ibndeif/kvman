import { describe, expect, it } from 'vitest';
import { layoutMap, mapCounts, nodeHeight, nodeWidth } from '../../web/src/map-layout.ts';
import { mapStep } from './support/fixtures.ts';

describe("the execution map's layout (08 §8.7, ADR 0064)", () => {
  it('M2.4-E229 a step sits one row past what it waits on, a row never overlaps, and arrows follow the waits', () => {
    const steps = [mapStep('read', { status: 'done' }), mapStep('store', { after: ['read'] }), mapStep('page', { after: ['read'] }), mapStep('test', { after: ['store', 'page'] }), mapStep('lost', { after: ['nowhere'] })];
    const layout = layoutMap(steps);
    const at = (id: string) => layout.nodes.find((node) => node.step.id === id) ?? { x: Number.NaN, y: Number.NaN };
    const row = (id: string): number => at(id).y / (nodeHeight + 34);
    expect(['read', 'lost', 'store', 'page', 'test'].map(row)).toEqual([0, 0, 1, 1, 2]);
    for (const [first, second] of [['read', 'lost'], ['store', 'page']] as const) expect(Math.abs(at(first).x - at(second).x)).toBeGreaterThanOrEqual(nodeWidth);
    for (const node of layout.nodes) {
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.x + nodeWidth).toBeLessThanOrEqual(layout.width);
      expect(node.y + nodeHeight).toBeLessThanOrEqual(layout.height);
    }
    expect(at('test').x + nodeWidth / 2).toBe(layout.width / 2);
    expect(layout.edges.map((edge) => [edge.from, edge.to, edge.reached])).toEqual([['read', 'store', true], ['read', 'page', true], ['store', 'test', false], ['page', 'test', false]]);
    expect(layout.edges[0]?.path.startsWith(`M ${at('read').x + nodeWidth / 2} ${nodeHeight} C `)).toBe(true);
    expect(mapCounts(steps)).toEqual({ done: 1, total: 5, left: 4 });
    // Given the width it may take, the steps of the widest row share it, between the least and the most a step takes.
    expect([layoutMap(steps, 273).stepWidth, layoutMap(steps, 273).width]).toEqual([130, 272]);
    expect(layoutMap(steps, 2000).stepWidth).toBe(172);
    expect(layoutMap(steps, 150).stepWidth).toBe(104);
    expect(layout.stepWidth).toBe(nodeWidth);
    // An arrow that skips a row goes down a lane of its own beside that row's steps, never behind one.
    const skipping = layoutMap([mapStep('a'), mapStep('b', { after: ['a'] }), mapStep('c', { after: ['a', 'b'] })]);
    const long = skipping.edges.find((edge) => edge.from === 'a' && edge.to === 'c');
    const middle = skipping.nodes.find((node) => node.step.id === 'b');
    const lane = Number(/ L (\S+) /.exec(long?.path ?? '')?.[1]);
    expect(lane < (middle?.x ?? 0) || lane > (middle?.x ?? 0) + nodeWidth).toBe(true);
    expect(skipping.edges.filter((edge) => edge !== long).every((edge) => !edge.path.includes(' L '))).toBe(true);
    expect(layoutMap([])).toMatchObject({ nodes: [], edges: [], height: 0 });
  });
});
