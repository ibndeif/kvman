import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { windowLayout } from '../../src/compose/frame-layout.ts';
import { useKvvideo } from '../support/kvvideo-kernel.ts';
import { useTestPages } from '../support/test-page.ts';

// A real render of the look (plan 16 §16.8, ADR 0115) with the ffmpeg on the PATH and Chrome: a page of four coloured
// quarters with a button in the red one is recorded and composed, and frames of the video are read back as pixels.

const kvvideo = useKvvideo();
const pages = useTestPages();

const quarters = `<!doctype html><html><body style="margin:0">
<div style="position:fixed;inset:0 50% 50% 0;background:#ff0000"></div><div style="position:fixed;inset:0 0 50% 50%;background:#00ff00"></div>
<div style="position:fixed;inset:50% 50% 0 0;background:#0000ff"></div><div style="position:fixed;inset:50% 0 0 50%;background:#ffff00"></div>
<button id="go" style="position:fixed;left:120px;top:60px;width:80px;height:40px">Go</button></body></html>`;

function pixel(file: string, seconds: number, x: number, y: number): number[] {
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-ss', seconds.toFixed(3), '-i', file, '-frames:v', '1', '-vf', `format=rgb24,crop=1:1:${String(Math.round(x))}:${String(Math.round(y))}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
  return [...raw];
}

const near = (actual: number[], expected: number[], tolerance = 48): boolean => actual.every((value, index) => Math.abs(value - (expected[index] ?? 0)) <= tolerance);

describe('a real render of the look (16 §16.8, ADR 0115)', () => {
  it('M5.7-H14 a window on the default gradient, the camera zoomed at the click, a blur, a callout, and boxed captions', async () => {
    const { kernel, workspace } = await kvvideo.start({ settings: { 'kvvideo.browser': 'chrome' } });
    const site = await pages.page(quarters);
    const recorded = await kernel.exec('kvvideo.clip.record', { url: site.url, file: 'v/q.mp4', width: 640, height: 360, steps: [{ do: 'wait', ms: 800 }, { do: 'click', target: '#go' }, { do: 'wait', ms: 1500 }] });
    const click = recorded.steps[1];
    await kernel.exec('kvvideo.video.compose', {
      file: 'look.mp4',
      width: 640,
      height: 360,
      scenes: [{ clip: 'v/q.mp4', captions: [{ text: 'Press Go', startMs: 0, endMs: 2000 }], overlays: [{ kind: 'blur', step: 2, fromMs: 0, toMs: 1000 }, { kind: 'callout', step: 2, text: 'Go', fromMs: 0, toMs: 4000 }] }],
    });
    const file = `${workspace}/look.mp4`;
    const { screen } = windowLayout({ width: 640, height: 360 }, { width: 1280, height: 720 }, true);
    expect(near(pixel(file, 0.1, 2, 2), [0x0f, 0x17, 0x2a])).toBe(true);
    const lowerRight = { x: screen.x + screen.width * 0.75, y: screen.y + screen.height * 0.75 };
    expect(near(pixel(file, 0.1, lowerRight.x, lowerRight.y), [255, 255, 0])).toBe(true);
    expect(near(pixel(file, ((click?.actMs ?? 0) + 300) / 1000, lowerRight.x, lowerRight.y), [255, 0, 0])).toBe(true);
  });
});
