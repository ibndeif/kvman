import { describe, expect, it } from 'vitest';
import { glideMs, glidePath, scrollPlan, typingDelays, type Point } from '../../src/record/motion.ts';

const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

// The distance of a point from the line through `a` and `b`.
function offLine(point: Point, a: Point, b: Point): number {
  return Math.abs((b.x - a.x) * (a.y - point.y) - (a.x - point.x) * (b.y - a.y)) / distance(a, b);
}

describe('how things move in a recording (16 §16.5, ADR 0115, 9)', () => {
  it('M5.5-H7 the pointer travels 400 to 900 ms by distance, on a gentle eased curve', () => {
    expect([0, 100, 500, 2000].map(glideMs)).toEqual([400, 400, 600, 900]);
    const from = { x: 0, y: 0 };
    const to = { x: 1000, y: 0 };
    const path = glidePath(from, to);
    expect(path.at(-1)).toEqual(to);
    expect(path.length).toBe(Math.round(glideMs(1000) / 16));
    const middle = path[Math.floor(path.length / 2)] ?? from;
    expect(offLine(middle, from, to)).toBeGreaterThan(0);
    expect(offLine(middle, from, to)).toBeLessThan(100);
    const steps = path.map((point, index) => distance(point, index === 0 ? from : (path[index - 1] ?? from)));
    const middleStep = steps[Math.floor(steps.length / 2)] ?? 0;
    expect(steps[0]).toBeLessThan(middleStep);
    expect(steps.at(-1)).toBeLessThan(middleStep);
    expect(glidePath(to, to).every((point) => point.x === to.x && point.y === to.y)).toBe(true);
  });

  it('M5.5-H8 typing has a varying pace that is the same for the same text', () => {
    const text = 'Hello, world';
    const delays = typingDelays(text);
    expect(delays).toEqual(typingDelays(text));
    expect(delays).toHaveLength(text.length);
    const characters = [...text];
    delays.forEach((delay, index) => {
      const extra = index > 0 && /[\s\p{P}]/u.test(characters[index - 1] ?? '') ? 150 : 0;
      expect(delay - extra).toBeGreaterThanOrEqual(35);
      expect(delay - extra).toBeLessThanOrEqual(110);
    });
    expect(delays[6]).toBeGreaterThanOrEqual(185);
    expect(delays[7]).toBeGreaterThanOrEqual(185);
    expect(new Set(delays).size).toBeGreaterThan(1);
    expect(typingDelays('Goodbye, world')).not.toEqual(typingDelays(text));
    expect(typingDelays('مرحبا 👋')).toHaveLength(7);
  });

  it('M5.5-H9 a scroll is eased and adds up to its pixels', () => {
    expect([100, 1000, -1000, 20_000].map((pixels) => scrollPlan(pixels).durationMs)).toEqual([450, 900, 900, 3000]);
    for (const pixels of [100, 1000, -1000, 20_000, 7]) {
      const { moves } = scrollPlan(pixels);
      expect(moves.reduce((sum, move) => sum + move, 0)).toBe(pixels);
    }
    const { moves } = scrollPlan(1000);
    const middle = moves[Math.floor(moves.length / 2)] ?? 0;
    expect(moves[0]).toBeLessThan(middle);
    expect(moves.at(-1)).toBeLessThan(middle);
  });
});
