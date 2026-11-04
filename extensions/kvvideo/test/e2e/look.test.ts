import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ProblemError } from '@kvman/sdk';
import { boxCenter, pictureSize, slidingBox } from '../support/box-position.ts';
import { useKvvideo } from '../support/kvvideo-kernel.ts';
import { useTestPages } from '../support/test-page.ts';

// `video look` (plan 16 §16.5 Looking; ADR 0117, 4 and 19) with the installed Chrome: a page's frames at chosen
// moments, read back from the kernel's files with the ffmpeg on the PATH.

const kvvideo = useKvvideo();
const pages = useTestPages();

const problemOf = (run: Promise<unknown>): Promise<unknown> =>
  run.then(
    () => undefined,
    (error: unknown) => (error instanceof ProblemError ? error.problem : error),
  );

async function world() {
  const started = await kvvideo.start({ settings: { 'kvvideo.browser': 'chrome' } });
  started.write('v/slide.html', slidingBox(2));
  const stored = (fileId: string): string => `${started.kernel.home}/files/${fileId}`;
  return { ...started, stored };
}

describe('video look (16 §16.5 Looking, ADR 0117)', () => {
  it('M5.12-H5 one JPEG per moment, at the CSS size, in increasing order, the box where its animation is', async () => {
    const { kernel, workspace, stored } = await world();
    const before = readdirSync(workspace, { recursive: true }).length;
    const answer = await kernel.exec('kvvideo.frame.capture', { page: 'v/slide.html', atMs: [800, 0, 400], width: 640, height: 360 });
    expect(answer.images.map(({ name, atMs }) => ({ name, atMs }))).toEqual([
      { name: 'look-1.jpg', atMs: 0 },
      { name: 'look-2.jpg', atMs: 400 },
      { name: 'look-3.jpg', atMs: 800 },
    ]);
    const files = answer.images.map((image) => stored(image.fileId));
    expect(files.map((file) => readFileSync(file).subarray(0, 2).toString('hex'))).toEqual(['ffd8', 'ffd8', 'ffd8']);
    expect(files.map(pictureSize)).toEqual(['640x360', '640x360', '640x360']);
    // The box slides 600 px a second from x 0 to 100, so its middle is at 50 px plus 0.6 px a millisecond.
    const centers = files.map((file) => boxCenter(file, 150, 640) ?? -1);
    expect(centers.map((center, index) => Math.abs(center - (50 + index * 400 * 0.6)) <= 6)).toEqual([true, true, true]);
    expect(readdirSync(workspace, { recursive: true }).length).toBe(before);
  });

  it('M5.12-H6 one frame at 1 s when no moment is given, of a website on a phone', async () => {
    const { kernel, stored } = await world();
    const site = await pages.page(slidingBox(2));
    const answer = await kernel.exec('kvvideo.frame.capture', { url: site.url, device: 'phone' });
    expect(answer.images.map(({ name, atMs }) => ({ name, atMs }))).toEqual([{ name: 'look-1.jpg', atMs: 1000 }]);
    expect(pictureSize(stored(answer.images[0]?.fileId ?? ''))).toBe('390x844');
  });

  it('M5.12-H7 two calls give the same frames', async () => {
    const { kernel, stored } = await world();
    const bytes = async (): Promise<string[]> => (await kernel.exec('kvvideo.frame.capture', { page: 'v/slide.html', atMs: [300, 900], width: 640, height: 360 })).images.map((image) => readFileSync(stored(image.fileId)).toString('base64'));
    expect(await bytes()).toEqual(await bytes());
  });

  it("M5.12-E3 a page that doesn't load fails STEP_FAILED with step 0", async () => {
    const { kernel } = await world();
    const port = await pages.closedPort();
    const problem = await problemOf(kernel.exec('kvvideo.frame.capture', { url: `http://127.0.0.1:${String(port)}/` }));
    expect(problem).toMatchObject({ code: 'kvvideo/STEP_FAILED', params: { step: 0, reason: expect.any(String) } });
  });

  it('M5.12-E5 past 24 frames, the oldest are deleted with their files', async () => {
    const { kernel, stored } = await world();
    const calls = [];
    for (let call = 0; call < 5; call += 1) calls.push((await kernel.exec('kvvideo.frame.capture', { page: 'v/slide.html', atMs: [0, 100, 200, 300, 400, 500], width: 640, height: 360 })).images);
    expect(calls.flat().filter((image) => existsSync(stored(image.fileId)))).toEqual(calls.flat().slice(6));
  });
});
