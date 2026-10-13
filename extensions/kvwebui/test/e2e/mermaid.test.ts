import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { startKvman, type RunningKvman } from './support/kvman.ts';

let browser: Browser;
let kvman: RunningKvman;

beforeAll(async () => {
  browser = await chromium.launch();
  kvman = await startKvman('en');
});

afterAll(async () => {
  await browser.close();
  await kvman.close();
});

// Page expressions are strings: they run in Chromium, where the DOM is, not in this Node process.
describe('Mermaid diagrams in Chromium (06 §6.4, ADR 0067)', { timeout: 60_000 }, () => {
  it('M2.4-E248 and E249 a mermaid block is drawn as plain SVG, a block that is no diagram stays, and Mermaid loads only here', async () => {
    const page = await browser.newPage();
    const scripts: string[] = [];
    page.on('request', (request) => {
      if (request.resourceType() === 'script') scripts.push(new URL(request.url()).pathname);
    });
    await page.goto(`${kvman.origin}/demo/progress`);
    await page.locator('[data-test="demo-progress"]').waitFor();
    const before = scripts.length;
    expect(scripts.filter((name) => /mermaid/i.test(name))).toEqual([]);
    await page.goto(`${kvman.origin}/demo/diagram`);
    await page.locator('[data-test="markdown"] .kvwebui-mermaid svg').waitFor();
    expect(scripts.length).toBeGreaterThan(before);
    const drawn = '[data-test="markdown"] .kvwebui-mermaid svg';
    expect(await page.evaluate(`[...document.querySelectorAll('${drawn} text, ${drawn} tspan')].map((label) => label.textContent).join(' ')`)).toMatch(/Start here.*All done/);
    expect(await page.evaluate(`document.querySelectorAll('${drawn} script, ${drawn} foreignObject, ${drawn} a').length`)).toBe(0);
    const box = await page.locator(drawn).boundingBox();
    expect(box !== null && box.width > 50 && box.height > 50).toBe(true);
    expect(await page.evaluate(`[...document.querySelectorAll('[data-test="markdown"] pre')].map((block) => block.textContent)`)).toEqual(['this is not a diagram\n', 'const a = 1;\n']);
    expect(await page.evaluate(`document.querySelectorAll('[data-test="markdown"] .kvwebui-mermaid').length`)).toBe(1);
    await page.close();
  });
});
