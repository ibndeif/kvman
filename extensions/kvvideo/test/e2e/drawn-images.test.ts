import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Browser } from 'playwright-core';
import { afterEach, describe, expect, it } from 'vitest';
import { launchDrawing } from '../../src/browser/launch.ts';
import { bundledFonts, fontsFolder } from '../../src/fonts/bundled-fonts.ts';
import { calloutHtml, chromeHtml, highlightHtml, maskHtml, painterOf } from '../../src/compose/drawn-images.ts';
import { phoneLayout, windowLayout } from '../../src/compose/frame-layout.ts';
import { composes, useFakePrograms } from '../support/fake-programs.ts';
import { useKvvideo } from '../support/kvvideo-kernel.ts';

// The images the browser draws for a scene (plan 16 §16.8, ADR 0115, 36 and 60), read back pixel by pixel with ffmpeg.

const kvvideo = useKvvideo();
const programs = useFakePrograms();
const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

function rgba(file: string, x: number, y: number): number[] {
  return [...execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', `format=rgba,crop=1:1:${String(x)}:${String(y)}`, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'])];
}

function sizeOf(file: string): string {
  return execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=s=x:p=0', file], { encoding: 'utf8' }).trim();
}

async function withPainter(use: (draw: (name: string, size: { width: number; height: number }, html: string, clear: boolean) => Promise<string>) => Promise<void>): Promise<void> {
  const folder = mkdtempSync(path.join(tmpdir(), 'kvvideo-drawn-'));
  folders.push(folder);
  const browser: Browser = await launchDrawing('chrome');
  try {
    const painter = painterOf(browser);
    await use(async (name, size, html, clear) => {
      const file = path.join(folder, name);
      await painter.draw(file, size, html, clear);
      return file;
    });
  } finally {
    await browser.close();
  }
}

describe('what the browser draws (16 §16.8, ADR 0115, 36 and 60)', () => {
  it("M5.7-H8 M5.11-H3 a window's chrome and mask, a phone, a callout (an Arabic one centred too), and a highlight", async () => {
    await withPainter(async (draw) => {
      const picture = { width: 640, height: 360 };
      const window = windowLayout(picture, { width: 1280, height: 720 }, true);
      const chrome = await draw('chrome.png', picture, chromeHtml(window), true);
      expect(sizeOf(chrome)).toBe('640x360');
      expect(rgba(chrome, 0, 0)[3]).toBe(0);
      expect(rgba(chrome, window.screen.x + 50, window.screen.y + 50)).toEqual([0, 0, 0, 255]);
      const underShadow = rgba(chrome, window.screen.x + window.screen.width / 2, window.screen.y + window.screen.height + 4);
      expect(underShadow[3]).toBeGreaterThan(20);
      const mask = await draw('mask.png', { width: window.screen.width, height: window.screen.height }, maskHtml({ width: window.screen.width, height: window.screen.height }, window.radius), false);
      expect([rgba(mask, 0, 0).slice(0, 3), rgba(mask, 40, 40).slice(0, 3)]).toEqual([
        [0, 0, 0],
        [255, 255, 255],
      ]);
      const phone = phoneLayout(picture, { width: 780, height: 1688 });
      const body = await draw('phone.png', picture, chromeHtml(phone), true);
      expect(rgba(body, phone.body.x + phone.body.width / 2, phone.body.y + phone.body.height / 2)).toEqual([0x11, 0x11, 0x11, 255]);
      const lato = bundledFonts.find((font) => font.name === 'Lato');
      const callout = await draw('callout.png', { width: 1280, height: 720 }, calloutHtml({ width: 1280, height: 720 }, { x: 300, y: 300, width: 100, height: 40 }, 'Save it', '#2563EB', { family: 'Lato', file: path.join(fontsFolder, lato?.file ?? '') }), true);
      expect(rgba(callout, 350, 300 - 40)).toEqual([0x25, 0x63, 0xeb, 255]);
      expect(rgba(callout, 350, 320)[3]).toBe(0);
      const arabic = await draw('callout-ar.png', { width: 1280, height: 720 }, calloutHtml({ width: 1280, height: 720 }, { x: 300, y: 300, width: 100, height: 40 }, 'احفظ', '#2563EB', { family: 'Lato', file: path.join(fontsFolder, lato?.file ?? '') }), true);
      expect(rgba(arabic, 350, 300 - 40)).toEqual([0x25, 0x63, 0xeb, 255]);
      expect(rgba(arabic, 900, 260)[3]).toBe(0);
      const highlight = await draw('highlight.png', { width: 1280, height: 720 }, highlightHtml({ x: 300, y: 300, width: 100, height: 40 }, 2), true);
      expect(rgba(highlight, 350, 320)[3]).toBe(0);
      expect(Math.abs((rgba(highlight, 20, 20)[3] ?? 0) - 140)).toBeLessThanOrEqual(2);
    });
  });

  it('M5.7-E6 a window on a clip without a recording takes the shape ffprobe measures', async () => {
    const ffmpeg = programs.program('ffmpeg', composes());
    const ffprobe = programs.program('ffprobe', "fs.appendFileSync(__filename + '.log', JSON.stringify(args) + '\\n'); console.log(args.includes('stream=width,height') ? '1000x500' : '4.0');");
    const { kernel, write } = await kvvideo.start({ settings: { 'kvvideo.programs.ffmpeg': ffmpeg, 'kvvideo.programs.ffprobe': ffprobe, 'kvvideo.browser': 'chrome' } });
    write('v/plain.mp4', 'video');
    await kernel.exec('kvvideo.video.compose', { file: 'a.mp4', width: 1280, height: 720, scenes: [{ clip: 'v/plain.mp4', frame: 'window' }] });
    expect(readFileSync(`${ffprobe}.log`, 'utf8')).toContain('stream=width,height');
    const graph = (JSON.parse(readFileSync(`${ffmpeg}.log`, 'utf8').split('\n')[0] ?? '{}') as { graph: string }).graph;
    const [width, height] = (/\[clip\]scale=(\d+):(\d+),format=yuva420p\[fit\]/.exec(graph) ?? []).slice(1).map(Number);
    expect((width ?? 0) / (height ?? 1)).toBeCloseTo(2, 1);
    expect(existsSync(`${ffmpeg}.log`)).toBe(true);
  });
});
