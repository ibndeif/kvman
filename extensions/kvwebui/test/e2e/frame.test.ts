import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { startKvman, type RunningKvman } from './support/kvman.ts';

let browser: Browser;
const running: RunningKvman[] = [];

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser.close();
  for (const kvman of running.splice(0)) await kvman.close();
});

async function kvmanIn(language: string): Promise<RunningKvman> {
  const kvman = await startKvman(language);
  running.push(kvman);
  return kvman;
}

// Page expressions are strings: they run in Chromium, where the DOM is, not in this Node process.
describe('kvwebui in Chromium (06 §6.1–§6.3, plan 12 §12.1)', { timeout: 60_000 }, () => {
  it('M2.2-H8 Arabic renders right to left', async () => {
    const kvman = await kvmanIn('ar');
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(kvman.url);
    await page.waitForSelector('[data-test="nav"]');
    expect(await page.evaluate('document.documentElement.dir')).toBe('rtl');
    const nav = await page.locator('[data-test="nav"]').boundingBox();
    const strip = await page.locator('[data-test="panel-strip"]').boundingBox();
    expect(nav !== null && nav.x + nav.width).toBe(1280);
    expect(strip?.x).toBe(0);
    expect(await page.locator('[data-test="nav-notes.list"]').textContent()).toBe('الملاحظات');
    expect(new URL(page.url()).search).toBe('');
    await page.close();
  });

  it('M2.2-E22 kvman serves the app, app routes fall back to it, and links navigate without a page load', async () => {
    const kvman = await kvmanIn('en');
    const page = await browser.newPage();
    const fonts: number[] = [];
    page.on('response', (response) => {
      if (response.url().startsWith(kvman.origin) && response.url().endsWith('.woff2')) fonts.push(response.status());
    });
    await page.goto(`${kvman.origin}/notes/note/n1`);
    await page.getByText('Showing note n1').waitFor();
    expect(await page.evaluate('getComputedStyle(document.body).backgroundColor')).toBe('rgb(246, 245, 241)');
    await page.evaluate('document.fonts.ready.then(() => true)');
    expect(fonts.length).toBeGreaterThan(0);
    expect(fonts.every((status) => status === 200)).toBe(true);
    await page.goto(`${kvman.origin}/`);
    await page.getByRole('heading', { name: 'Notes' }).waitFor();
    await page.evaluate("window.kvwebuiMarker = 'same page'");
    await page.getByText('Open note n2').click();
    await page.getByText('Showing note n2').waitFor();
    expect(await page.evaluate('window.kvwebuiMarker')).toBe('same page');
    await page.close();
  });
});
