import { describe, expect, it } from 'vitest';
import { imageZoom, perspectiveFilter } from '../../src/compose/camera.ts';
import { sceneArgs, type SceneRender } from '../../src/compose/scene-args.ts';
import { drawnFrameCount, drawnLengthMs, frameTimeMs, isDrawn } from '../../src/record/drawn-page.ts';
import { cuesOf } from '../../src/record/narration-cues.ts';

// A drawn page's length and frames (plan 16 §16.5 Drawn frame by frame; ADR 0120, 13 and 14), and the video's 60
// frames a second (§16.8; ADR 0120, 12).

describe("a drawn page's length (16 §16.5, ADR 0120)", () => {
  it('M5.15-E2 a drawn page lasts as long as its waits, or its narration asks', () => {
    expect(drawnLengthMs([], cuesOf({ durationMs: 3000, captions: [{ startMs: 0 }] }))).toBe(3600);
    expect(drawnLengthMs([], undefined)).toBe(1500);
    expect(drawnLengthMs([{ do: 'wait', ms: 1000 }, { do: 'wait', ms: 500 }], undefined)).toBe(3000);
    expect([drawnFrameCount(2500), drawnFrameCount(2510), frameTimeMs(60)]).toEqual([150, 151, 1000]);
    expect(isDrawn({ kind: 'page', file: '/w/a.html' }, [{ do: 'wait', ms: 1 }])).toBe(true);
    expect(isDrawn({ kind: 'page', file: '/w/a.html' }, [{ do: 'click', target: '#go' }])).toBe(false);
    expect(isDrawn({ kind: 'site', url: 'http://localhost/' }, [])).toBe(false);
  });

  it('M5.15-H8 the video is 60 frames a second, and the camera reads time as frames over 60', () => {
    expect(perspectiveFilter(imageZoom(4000), 'input', 0)).toContain('(in*1000/60+0)');
    const scene: SceneRender = { scene: { number: 1, kind: 'image', clip: '/w/a.png', startMs: 0, partMs: 0, lengthMs: 2000, narration: undefined }, look: { frame: 'none', camera: undefined, overlays: [], scale: 1 }, background: { kind: 'gradient', from: '#000000', to: '#000000' }, drawn: { layout: undefined, chrome: undefined, mask: undefined, overlayImages: [] }, captioned: false };
    const { args, graph } = sceneArgs(scene, { width: 1280, height: 720 }, 'part-1.mkv');
    expect(args.slice(3, 7)).toEqual(['-loop', '1', '-framerate', '60']);
    expect(args[args.indexOf('-r') + 1]).toBe('60');
    expect(graph).toContain('[0:v]fps=60,');
  });
});
