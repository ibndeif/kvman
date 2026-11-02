import { describe, expect, it } from 'vitest';
import { ProblemError } from '@kvman/sdk';
import { sceneStarts, transitionsOf, xfadeName, type Transition } from '../../src/compose/transitions.ts';

const codeOf = (run: () => unknown): string | undefined => {
  try {
    run();
    return undefined;
  } catch (error) {
    return error instanceof ProblemError ? error.problem.code : String(error);
  }
};

describe('transitions (16 §16.8, ADR 0115, 12)', () => {
  it('M5.8-H2 a default crossfade, a slide, and the scenes starts', () => {
    const transitions = transitionsOf([{ clip: 'a.png' }, { clip: 'b.png', transition: { kind: 'slide', ms: 400 } }, { clip: 'c.png' }], [3000, 2000, 4000]);
    expect(transitions).toEqual([
      { kind: 'crossfade', toward: 'start', ms: 500 },
      { kind: 'slide', toward: 'start', ms: 400 },
    ]);
    expect(sceneStarts([3000, 2000, 4000], transitions)).toEqual({ starts: [0, 2500, 4100], durationMs: 8100 });
    const slide = (toward: Transition['toward']): Transition => ({ kind: 'slide', toward, ms: 400 });
    expect([xfadeName(slide('start'), 'ltr'), xfadeName(slide('start'), 'rtl'), xfadeName(slide('end'), 'ltr'), xfadeName(slide('end'), 'rtl'), xfadeName(slide('up'), 'ltr'), xfadeName(slide('down'), 'rtl')]).toEqual(['slideleft', 'slideright', 'slideright', 'slideleft', 'slideup', 'slidedown']);
    expect([xfadeName({ kind: 'crossfade', toward: 'start', ms: 500 }, 'ltr'), xfadeName({ kind: 'fade-black', toward: 'start', ms: 500 }, 'ltr'), xfadeName({ kind: 'cut', toward: 'start', ms: 0 }, 'ltr')]).toEqual(['fade', 'fadeblack', undefined]);
  });

  it('M5.8-H3 a default crossfade fits a short scene, and a cut is 0 ms', () => {
    expect(transitionsOf([{ clip: 'a.png' }, { clip: 'b.png' }], [600, 3000])).toEqual([{ kind: 'crossfade', toward: 'start', ms: 300 }]);
    expect(transitionsOf([{ clip: 'a.png', transition: { kind: 'cut', ms: 900 } }, { clip: 'b.png' }], [600, 3000])).toEqual([{ kind: 'cut', toward: 'start', ms: 0 }]);
  });

  it('M5.8-E1 a transition longer than half a scene, or on the last scene, fails', () => {
    expect(codeOf(() => transitionsOf([{ clip: 'a.png', transition: { kind: 'crossfade', ms: 1600 } }, { clip: 'b.png' }], [3000, 3000]))).toBe('VALIDATION_FAILED');
    expect(codeOf(() => transitionsOf([{ clip: 'a.png' }, { clip: 'b.png', transition: { kind: 'crossfade', ms: 400 } }, { clip: 'c.png' }], [3000, 700, 3000]))).toBe('VALIDATION_FAILED');
    expect(codeOf(() => transitionsOf([{ clip: 'a.png' }, { clip: 'b.png', transition: { kind: 'cut' } }], [3000, 3000]))).toBe('VALIDATION_FAILED');
  });
});
