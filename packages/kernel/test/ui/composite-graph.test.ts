import { compositeCycles, compositeDepths, type CompositeGraph } from '../../src/ui/composite-graph.ts';
import { describe, expect, it } from 'vitest';

describe('composite graphs (plan 08 §8.9)', () => {
  it('M2.10-E39 cycles are reported once and depths count nested levels', () => {
    expect(compositeCycles(new Map([['pdf.self', ['pdf.self']]]))).toEqual([['pdf.self', 'pdf.self']]);
    expect(compositeCycles(new Map([['pdf.a', ['pdf.b']], ['pdf.b', ['pdf.a']]]))).toEqual([['pdf.a', 'pdf.b', 'pdf.a']]);
    expect(compositeCycles(new Map([
      ['pdf.a', ['pdf.b', 'pdf.c']], ['pdf.b', ['pdf.d']], ['pdf.c', ['pdf.d']], ['pdf.d', []],
    ]))).toEqual([]);
    const chain: CompositeGraph = new Map(
      Array.from({ length: 9 }, (_, index) => [`pdf.c${index + 1}`, index === 8 ? [] : [`pdf.c${index + 2}`]]),
    );
    expect(compositeDepths(chain).get('pdf.c1')).toBe(9);
    expect(compositeDepths(chain).get('pdf.c9')).toBe(1);
    const diamond: CompositeGraph = new Map([
      ['pdf.a', ['pdf.b', 'pdf.c']], ['pdf.b', ['pdf.d']], ['pdf.c', ['pdf.d']], ['pdf.d', []],
    ]);
    expect(compositeDepths(diamond).get('pdf.a')).toBe(3);
  });
});
