import { describe, expect, it } from 'vitest';
import { boxCenter, slidingBox } from '../support/box-position.ts';
import { useKvvideo } from '../support/kvvideo-kernel.ts';

// A page's clock (plan 16 §16.5; ADR 0117, 5): the page waits at least 500 ms of network quiet before its capture
// starts, and its animation is held until then, recorded with Chrome and the ffmpeg on the PATH.

const kvvideo = useKvvideo();

describe("a page's clock starts with its recording (16 §16.5, ADR 0117)", () => {
  it('M5.12-H4 a box that slides 600 px a second is at its start in the first frame and half way at 0.5 s', async () => {
    const { kernel, workspace, write } = await kvvideo.start({ settings: { 'kvvideo.browser': 'chrome' } });
    write('v/slide.html', slidingBox(1));
    const recorded = await kernel.exec('kvvideo.clip.record', { page: 'v/slide.html', file: 'v/slide.mp4', width: 640, height: 360 });
    expect(recorded.durationMs).toBeGreaterThanOrEqual(1500);
    const file = `${workspace}/v/slide.mp4`;
    expect(boxCenter(file, 150, 640, 0)).toBeLessThan(110);
    const half = boxCenter(file, 150, 640, 0.5) ?? 0;
    expect(half).toBeGreaterThan(260);
    expect(half).toBeLessThan(440);
  });
});
