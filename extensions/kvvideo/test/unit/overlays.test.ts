import { describe, expect, it } from 'vitest';
import { insidePage, overlayFilters } from '../../src/compose/overlays.ts';
import { lookOf } from '../../src/compose/scene-look.ts';

const recording = {
  kind: 'site' as const,
  source: 'http://localhost/',
  width: 1280,
  height: 720,
  device: 'desktop' as const,
  scale: 2 as const,
  durationMs: 5000,
  steps: [],
  actions: [{ do: 'wait', atMs: 500, endMs: 900 }, { do: 'click', atMs: 900, actMs: 1500, endMs: 1550, box: { x: 100, y: 50, width: 200, height: 40 } }],
};

describe('overlays on a recorded page (16 §16.8, ADR 0115, 11)', () => {
  it("M5.7-H7 a step's box at 2x, a callout that fades, a highlight, and a blur, in their times", () => {
    const look = lookOf(1, { clip: 'a.mp4', overlays: [{ kind: 'callout', step: 2, text: 'Save', fromMs: 1000, toMs: 3000 }, { kind: 'highlight', box: { x: 0, y: 0, width: 10, height: 10 }, fromMs: 0, toMs: 500 }, { kind: 'blur', step: 2, fromMs: 0, toMs: 5000 }] }, 'video', recording, { width: 2560, height: 1440 }, 5000);
    expect(look.overlays.map((overlay) => overlay.box)).toEqual([
      { x: 200, y: 100, width: 400, height: 80 },
      { x: 0, y: 0, width: 20, height: 20 },
      { x: 200, y: 100, width: 400, height: 80 },
    ]);
    const { filters, output } = overlayFilters('clip', [
      { kind: 'callout', fromMs: 1000, toMs: 3000, input: 3 },
      { kind: 'highlight', fromMs: 0, toMs: 500, input: 4 },
      { kind: 'blur', fromMs: 0, toMs: 5000, box: { x: 200, y: 100, width: 400, height: 80 } },
    ]);
    expect(filters).toEqual([
      '[3:v]format=rgba,fade=t=in:st=1.000:d=0.2:alpha=1,fade=t=out:st=2.800:d=0.2:alpha=1[oi0]',
      "[clip][oi0]overlay=0:0:enable='between(t,1.000,3.000)'[oo0]",
      '[4:v]format=rgba[oi1]',
      "[oo0][oi1]overlay=0:0:enable='between(t,0.000,0.500)'[oo1]",
      '[oo1]split[ow2][op2]',
      '[op2]crop=400:80:200:100,gblur=sigma=20[ob2]',
      "[ow2][ob2]overlay=200:100:enable='between(t,0.000,5.000)'[oo2]",
    ]);
    expect(output).toBe('oo2');
  });

  it('M5.7-H7 a box is kept inside the page', () => {
    expect(insidePage({ x: -10, y: 1430, width: 50, height: 40 }, { width: 2560, height: 1440 })).toEqual({ x: 0, y: 1430, width: 50, height: 10 });
    expect(insidePage({ x: 2600, y: 0, width: 50, height: 40 }, { width: 2560, height: 1440 })).toEqual({ x: 2558, y: 0, width: 2, height: 40 });
  });
});
