import { readFileSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import type { Browser } from 'playwright-core';
import { describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import { cursorScript } from '../../src/record/cursor-script.ts';
import { pageAddress } from '../../src/record/page-route.ts';
import { recordingContext } from '../../src/record/recorder.ts';
import { sceneAssetsOf } from '../../src/record/scene-address.ts';
import { waitUntilReady } from '../../src/record/page-ready.ts';
import { countsFrames, useFakePrograms } from '../support/fake-programs.ts';
import { useKvvideo } from '../support/kvvideo-kernel.ts';
import { useTestPages } from '../support/test-page.ts';

const kvvideo = useKvvideo();
const programs = useFakePrograms();
const pages = useTestPages();

const encoded = z.object({ frames: z.number(), distinct: z.number(), width: z.number(), height: z.number() });

async function world() {
  const ffmpeg = programs.program('ffmpeg', countsFrames);
  return kvvideo.start({ settings: { 'kvvideo.browser': 'chrome', 'kvvideo.programs.ffmpeg': ffmpeg } });
}

async function withChrome(use: (browser: Browser) => Promise<void>): Promise<void> {
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    await use(browser);
  } finally {
    await browser.close();
  }
}

const titlePage = '<!doctype html><html><head><link rel="stylesheet" href="style.css"></head><body><div id="box"></div><img id="pic" src="img/pic.png"></body></html>';

// A 1 × 1 PNG.
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const animated = 'body { background: rgb(1, 2, 3); } #box { width: 300px; height: 300px; animation: pulse .5s infinite alternate; } @keyframes pulse { from { background: red; } to { background: blue; } }';

describe('video record of a page, a phone, and a narration (16 §16.5, ADR 0115)', () => {
  it('M5.5-H4 M5.5-E6 a page records with the files beside it, and a path out of its folder is 404', async () => {
    const { kernel, workspace, write } = await world();
    write('videos/t/title.html', titlePage);
    write('videos/t/style.css', animated);
    write('videos/t/img/pic.png', png);
    write('videos/secret.txt', 'secret');
    await kernel.exec('kvvideo.clip.record', { page: 'videos/t/title.html', file: 'videos/t/title.mp4', width: 640, height: 360, steps: [{ do: 'wait', ms: 1000 }] });
    const output = encoded.parse(JSON.parse(readFileSync(`${workspace}/videos/t/title.mp4`, 'utf8')));
    expect({ width: output.width, height: output.height }).toEqual({ width: 1280, height: 720 });
    expect(output.distinct).toBeGreaterThan(1);
    expect(JSON.parse(readFileSync(`${workspace}/videos/t/title.mp4.kvvideo.json`, 'utf8'))).toMatchObject({ kind: 'page', source: 'videos/t/title.html' });
    await withChrome(async (browser) => {
      const file = path.join(workspace, 'videos/t/title.html');
      const { context } = await recordingContext(browser, { source: { kind: 'page', file }, width: 640, height: 360, device: 'desktop', ownPort: null, assets: sceneAssetsOf(workspace, null) });
      const page = await context.newPage();
      await page.goto(pageAddress(file));
      expect(await page.evaluate('getComputedStyle(document.body).backgroundColor')).toBe('rgb(1, 2, 3)');
      expect(await page.evaluate("document.getElementById('pic').naturalWidth")).toBe(1);
      for (const relative of ['missing.css', '..%2Fsecret.txt', '../secret.txt']) expect(await page.evaluate(`fetch(${JSON.stringify(relative)}).then((answer) => answer.status)`)).toBe(404);
      await context.close();
    });
  });

  it('M5.5-H10 a phone recording taps and types', async () => {
    const { kernel } = await world();
    const app = await pages.app();
    await kernel.exec('kvvideo.clip.record', { url: app.url, file: 'phone.mp4', device: 'phone', steps: [{ do: 'type', target: 'role=textbox[name="Name"]', text: 'Pat' }, { do: 'click', target: 'text=Save' }] });
    expect(app.saved).toEqual(['Pat']);
    expect(app.requests).toContain('/touched');
  });

  it('M5.5-H11 steps start at their caption line, and the recording lasts the narration', async () => {
    const { kernel, write } = await world();
    const app = await pages.app();
    write('talk.mp3', 'audio');
    write('talk.mp3.kvvideo.json', JSON.stringify({ kind: 'narration', durationMs: 4000, captions: [0, 1500, 3000].map((startMs) => ({ text: 'Line.', startMs, endMs: startMs + 1500 })) }));
    const answer = await kernel.exec('kvvideo.clip.record', { url: app.url, file: 'talk.mp4', width: 640, height: 360, narration: 'talk.mp3', steps: [{ do: 'click', target: 'text=Save', atLine: 2 }, { do: 'hover', target: '#next', atLine: 3 }] });
    expect(answer.steps[0]?.atMs).toBeGreaterThanOrEqual(1800);
    expect(answer.steps[1]?.atMs).toBeGreaterThanOrEqual(3300);
    expect(answer.durationMs).toBeGreaterThanOrEqual(4600);
  });

  it('M5.5-H14 progress for each step, as a key with its numbers', async () => {
    const { kernel } = await world();
    const app = await pages.app();
    const chunks: unknown[] = [];
    await kernel.exec('kvvideo.clip.record', { url: app.url, file: 'p.mp4', width: 640, height: 360, steps: [{ do: 'wait', ms: 0 }, { do: 'hover', target: '#next' }, { do: 'wait', ms: 0 }] }, { onProgress: (chunk) => chunks.push(chunk) });
    expect(chunks).toEqual([1, 2, 3].map((n) => ({ source: '@kvman/kvvideo', data: { key: 'kvvideo.progress.step', params: { n, of: 3 } } })));
  });

  it('M5.5-H15 readiness waits for a late request and the fonts; scroll bars are hidden', async () => {
    await withChrome(async (browser) => {
      const page = await browser.newPage();
      await page.addInitScript(cursorScript('desktop'));
      let lateAnsweredAt: number | undefined;
      await page.route('http://ready.test/**', async (route) => {
        if (!route.request().url().endsWith('/late')) return route.fulfill({ contentType: 'text/html', body: "<p>Ready</p><script>addEventListener('load', () => fetch('/late'));</script>" });
        await new Promise((resolve) => setTimeout(resolve, 800));
        lateAnsweredAt = performance.now();
        return route.fulfill({ contentType: 'text/plain', body: 'late' });
      });
      await page.goto('http://ready.test/', { waitUntil: 'load' });
      expect(lateAnsweredAt).toBeUndefined();
      await waitUntilReady(page);
      expect(lateAnsweredAt).toBeLessThanOrEqual(performance.now());
      expect(await page.evaluate('getComputedStyle(document.documentElement).scrollbarWidth')).toBe('none');
    });
  });

  it('M5.5-H6 the arrow is hidden until the mouse moves, follows it in either direction, and shrinks and rings on a press', async () => {
    await withChrome(async (browser) => {
      for (const direction of ['ltr', 'rtl']) {
        const page = await browser.newPage();
        await page.addInitScript(cursorScript('desktop'));
        await page.route('http://pointer.test/', (route) => route.fulfill({ contentType: 'text/html', body: `<html dir="${direction}"><body><p>Pointer</p></body></html>` }));
        await page.goto('http://pointer.test/');
        const pointer = page.locator('#kvvideo-cursor');
        expect(await pointer.isVisible()).toBe(false);
        await page.mouse.move(120, 80);
        expect(await pointer.isVisible()).toBe(true);
        const box = await pointer.boundingBox();
        expect(Math.abs((box?.x ?? 0) - 117)).toBeLessThanOrEqual(2);
        expect(Math.abs((box?.y ?? 0) - 78)).toBeLessThanOrEqual(2);
        await page.mouse.down();
        expect(await pointer.getAttribute('style')).toContain('scale(0.85)');
        expect(await page.locator('.kvvideo-ring').count()).toBe(1);
        await page.mouse.up();
        await expect.poll(() => pointer.getAttribute('style')).toContain('scale(1)');
        await page.close();
      }
    });
  });

  it('M5.5-H10 a tap on a phone shows the touch mark there', async () => {
    await withChrome(async (browser) => {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      await context.addInitScript(cursorScript('phone'));
      const page = await context.newPage();
      await page.route('http://touch.test/', (route) => route.fulfill({ contentType: 'text/html', body: '<p>Touch</p>' }));
      await page.goto('http://touch.test/');
      await page.touchscreen.tap(50, 60);
      expect(await page.locator('#kvvideo-cursor').count()).toBe(0);
      const ring = await page.locator('.kvvideo-ring').boundingBox();
      expect(Math.abs((ring?.x ?? 0) + (ring?.width ?? 0) / 2 - 50)).toBeLessThanOrEqual(3);
      await context.close();
    });
  });
});
