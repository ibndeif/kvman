import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Page } from 'playwright-core';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import { holdPageClock } from '../../src/record/page-clock.ts';
import { pageAddress } from '../../src/record/page-route.ts';
import { recordingContext } from '../../src/record/recorder.ts';
import { sceneAssetsOf } from '../../src/record/scene-address.ts';

// The motion kit (plan 16 §16.5 The motion kit; ADR 0120, 1), served at kvvideo/motion.css, in the installed Chrome:
// each class's styles read back at chosen moments of the page's held clock.

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

const kitPage = (dir: 'ltr' | 'rtl'): string => `<!doctype html><html dir="${dir}"><head><link rel="stylesheet" href="kvvideo/motion.css">
<style>div, span { width: 40px; height: 40px; background: #fff; }</style></head><body>
<div id="rise" class="kv-rise" style="--at: 1s"></div>
<div id="slide" class="kv-slide"></div>
<div id="wipe" class="kv-wipe"></div>
<div id="pop" class="kv-pop"></div>
<p class="kv-words"><span id="word-1" style="--i: 0"></span><span id="word-2" style="--i: 1"></span><span id="word-3" style="--i: 2"></span></p>
<svg width="200" height="20"><path id="draw" class="kv-draw" pathLength="1" d="M0 10 H200" stroke="#fff" stroke-width="10" style="--length: 1s"/></svg>
<p id="count" class="kv-count" style="--from: 0; --to: 100; --length: 1s"></p>
<div id="float" class="kv-rise kv-float"></div>
<div id="pulse" class="kv-pulse" style="--em-at: 2s"></div>
<div id="leave" class="kv-fade kv-out" style="--out: 3s"></div>
</body></html>`;

type Styles = { opacity: number; translate: number[]; scale: string; transform: string; clipPath: string; dashOffset: number; count: number };

async function stylesOf(page: Page, id: string): Promise<Styles> {
  // A missing element reads as the document's root, whose styles fail every check.
  const read = z
    .object({ opacity: z.string(), translate: z.string(), scale: z.string(), transform: z.string(), clipPath: z.string(), dashOffset: z.string(), count: z.string() })
    .parse(
      await page.evaluate(`(() => {
        const style = getComputedStyle(document.getElementById(${JSON.stringify(id)}) ?? document.documentElement);
        return { opacity: style.opacity, translate: style.translate, scale: style.scale, transform: style.transform, clipPath: style.clipPath, dashOffset: style.strokeDashoffset, count: style.getPropertyValue('--kv-n') };
      })()`),
    );
  const numbers = (text: string): number[] => {
    const [x = 0, y = 0] = text === 'none' ? [] : text.split(' ').map((part) => Number.parseFloat(part));
    return [x, y];
  };
  return { opacity: Number(read.opacity), translate: numbers(read.translate), scale: read.scale, transform: read.transform, clipPath: read.clipPath, dashOffset: Number.parseFloat(read.dashOffset), count: Number(read.count) };
}

async function withKit(dir: 'ltr' | 'rtl', use: (at: (ms: number, id: string) => Promise<Styles>) => Promise<void>): Promise<void> {
  const folder = mkdtempSync(path.join(tmpdir(), 'kvvideo-kit-'));
  folders.push(folder);
  const file = path.join(folder, 'kit.html');
  writeFileSync(file, kitPage(dir));
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const { context } = await recordingContext(browser, { source: { kind: 'page', file }, width: 640, height: 360, device: 'desktop', ownPort: null, assets: sceneAssetsOf(folder, null) });
    const page = await context.newPage();
    const clock = await holdPageClock(page);
    await page.goto(pageAddress(file));
    await use(async (ms, id) => {
      await clock.seek(ms);
      return stylesOf(page, id);
    });
  } finally {
    await browser.close();
  }
}

describe('the motion kit (16 §16.5, ADR 0120, 1)', () => {
  it("M5.14-H8 the entrances, emphasis, ambient motion, and exit, each at its time", async () => {
    await withKit('ltr', async (at) => {
      expect((await at(500, 'rise')).opacity).toBe(0);
      const rising = await at(1300, 'rise');
      expect([rising.opacity > 0 && rising.opacity < 1, (rising.translate[1] ?? 0) > 0]).toEqual([true, true]);
      expect(await at(2000, 'rise')).toMatchObject({ opacity: 1, translate: [0, 0] });
      expect((await at(150, 'slide')).translate[0]).toBeLessThan(0);
      expect((await at(420, 'wipe')).clipPath).toMatch(/^inset\(0px [1-9][\d.]*% 0px 0(px|%)\)$/);
      expect(await at(2000, 'pop')).toMatchObject({ opacity: 1, scale: '1' });
      const [first, third] = [await at(100, 'word-1'), await at(100, 'word-3')];
      expect([first.opacity > 0, third.opacity]).toEqual([true, 0]);
      const drawn = (await at(500, 'draw')).dashOffset;
      expect(drawn > 0.25 && drawn < 0.75).toBe(true);
      expect((await at(1200, 'draw')).dashOffset).toBe(0);
      const counting = (await at(500, 'count')).count;
      expect(counting > 0 && counting < 100).toBe(true);
      expect((await at(1200, 'count')).count).toBe(100);
      const floating = await at(2000, 'float');
      expect([floating.opacity, floating.transform !== 'none']).toEqual([1, true]);
      expect(Number.parseFloat((await at(2350, 'pulse')).scale)).toBeGreaterThan(1.05);
      expect((await at(2000, 'leave')).opacity).toBe(1);
      expect((await at(3600, 'leave')).opacity).toBe(0);
    });
  });

  it('M5.14-H9 the kit moves along the line of a right-to-left page', async () => {
    await withKit('rtl', async (at) => {
      expect((await at(150, 'slide')).translate[0]).toBeGreaterThan(0);
      expect((await at(420, 'wipe')).clipPath).toMatch(/^inset\(0px 0(px|%) 0px [1-9][\d.]*%\)$/);
    });
  });
});
