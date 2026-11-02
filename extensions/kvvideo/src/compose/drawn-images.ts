import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Browser } from 'playwright-core';
import type { CaptionFont } from './caption-font.ts';
import type { Layout, Rect, Size } from './frame-layout.ts';

// What the browser draws for a scene (plan 16 §16.8; ADR 0115, 10, 11, 36, and 60), each a PNG of its size: a
// window's shadow or a phone's outline on a clear picture, the clip's rounded corners as a white-on-black mask, a
// callout's label pointing at its box, and a highlight that dims all but its box.

export type Painter = { draw(file: string, size: Size, html: string, clear: boolean): Promise<void> };

/** A painter on a browser, drawing at one pixel per CSS pixel. */
export function painterOf(browser: Browser): Painter {
  return {
    draw: async (file, size, html, clear) => {
      const context = await browser.newContext({ viewport: size, deviceScaleFactor: 1 });
      try {
        const page = await context.newPage();
        await page.setContent(html, { waitUntil: 'load' });
        await page.evaluate('document.fonts.ready.then(() => true)');
        await page.screenshot({ path: file, omitBackground: clear, scale: 'css' });
      } finally {
        await context.close();
      }
    },
  };
}

const px = (value: number): string => `${String(Math.round(value))}px`;

const placed = (rect: Rect): string => `position:absolute;inset-inline-start:${px(rect.x)};inset-block-start:${px(rect.y)};inline-size:${px(rect.width)};block-size:${px(rect.height)}`;

const pageOf = (body: string, background: string): string => `<!doctype html><html dir="ltr"><head><style>html,body{margin:0;background:${background};overflow:hidden}</style></head><body>${body}</body></html>`;

/** The window's shadow or the phone's body, on a clear picture. */
export function chromeHtml(layout: Layout): string {
  if (layout.kind === 'window') {
    const { offset, blur } = layout.shadow;
    return pageOf(`<div style="${placed(layout.screen)};border-radius:${px(layout.radius)};background:#000;box-shadow:0 ${px(offset)} ${px(blur)} rgba(0,0,0,.45)"></div>`, 'transparent');
  }
  const outline = Math.max(1, Math.round(layout.body.width * 0.006));
  return pageOf(`<div style="${placed(layout.body)};border-radius:${px(layout.bodyRadius)};background:#111;box-shadow:inset 0 0 0 ${px(outline)} #3a3a3a,0 ${px(layout.body.height * 0.02)} ${px(layout.body.height * 0.05)} rgba(0,0,0,.45)"></div>`, 'transparent');
}

/** The clip's rounded corners: white inside, black outside, the size of the clip's place. */
export function maskHtml(size: Size, radius: number): string {
  return pageOf(`<div style="${placed({ x: 0, y: 0, ...size })};border-radius:${px(radius)};background:#fff"></div>`, '#000');
}

/** A highlight over a page of `size`: dimmed to 55% black but the box, with 12 CSS pixels around it, rounded. */
export function highlightHtml(box: Rect, scale: number): string {
  const around = 12 * scale;
  const hole = { x: box.x - around, y: box.y - around, width: box.width + 2 * around, height: box.height + 2 * around };
  return pageOf(`<div style="${placed(hole)};border-radius:${px(around)};box-shadow:0 0 0 99999px rgba(0,0,0,.55)"></div>`, 'transparent');
}

const escaped = (text: string): string => text.replace(/[&<>"']/g, (character) => `&#${String(character.codePointAt(0))};`);

const luminance = (colour: string): number => {
  const [red, green, blue] = [1, 3, 5].map((at) => {
    const value = Number.parseInt(colour.slice(at, at + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (red ?? 0) + 0.7152 * (green ?? 0) + 0.0722 * (blue ?? 0);
};

/** White or near-black, whichever contrasts more with `background`. */
export function textOn(background: string): string {
  const light = luminance(background);
  return 1.05 / (light + 0.05) >= (light + 0.05) / (luminance('#111111') + 0.05) ? '#ffffff' : '#111111';
}

const fontFace = (font: CaptionFont): string => `@font-face{font-family:kvvideo;src:url(data:font/${path.extname(font.file).slice(1).toLowerCase()};base64,${readFileSync(font.file).toString('base64')})}`;

/** A callout's label over a page of `size`, pointing at the box: above it when there is room, else below. */
export function calloutHtml(size: Size, box: Rect, text: string, colour: string, font: CaptionFont): string {
  const fontSize = Math.round(size.height * 0.045);
  const arrow = Math.round(fontSize * 0.5);
  const margin = Math.round(size.width * 0.02);
  const script = `const label = document.getElementById('label'); const tip = document.getElementById('tip');
const box = ${JSON.stringify(box)}; const width = label.offsetWidth; const height = label.offsetHeight;
const above = box.y - height - ${String(arrow * 2)} > ${String(margin)};
const left = Math.min(Math.max(${String(margin)}, box.x + box.width / 2 - width / 2), ${String(size.width - margin)} - width);
const top = above ? box.y - height - ${String(arrow * 2)} : box.y + box.height + ${String(arrow * 2)};
label.style.insetInlineStart = left + 'px'; label.style.insetBlockStart = top + 'px';
tip.style.insetInlineStart = (box.x + box.width / 2 - ${String(arrow)}) + 'px';
tip.style.insetBlockStart = (above ? top + height : top - ${String(arrow)}) + 'px';
tip.style.borderBlockStart = above ? '${String(arrow)}px solid ${colour}' : '0'; tip.style.borderBlockEnd = above ? '0' : '${String(arrow)}px solid ${colour}';`;
  const label = `<div id="label" dir="auto" style="position:absolute;white-space:nowrap;font:700 ${px(fontSize)}/1.2 kvvideo,sans-serif;color:${textOn(colour)};background:${colour};padding:.45em .9em;border-radius:999px;box-shadow:0 ${px(fontSize * 0.15)} ${px(fontSize * 0.5)} rgba(0,0,0,.35)">${escaped(text)}</div>`;
  const tip = `<div id="tip" style="position:absolute;inline-size:0;block-size:0;border-inline:${px(arrow)} solid transparent"></div>`;
  return pageOf(`<style>${fontFace(font)}</style>${label}${tip}<script>document.fonts.ready.then(() => {${script}});</script>`, 'transparent');
}
