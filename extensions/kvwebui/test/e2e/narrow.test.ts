import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
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

async function started(): Promise<RunningKvman> {
  const kvman = await startKvman('en');
  running.push(kvman);
  return kvman;
}

const widthOf = (page: Page, selector: string): Promise<number> => page.locator(selector).evaluate((element) => element.getBoundingClientRect().width);
const startOf = (page: Page, selector: string): Promise<number> => page.locator(selector).evaluate((element) => element.getBoundingClientRect().x);
const scrollsSideways = (page: Page): Promise<boolean> => page.evaluate('document.documentElement.scrollWidth > window.innerWidth');

describe('kvwebui in a narrow window (06 §6.2, ADR 0009, 134)', { timeout: 60_000 }, () => {
  it('QA1-H5 the nav is an icon rail that opens over the page, closes on a pick, and nothing scrolls sideways', async () => {
    const kvman = await started();
    const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
    await page.goto(kvman.origin);
    await page.waitForSelector('[data-test="nav"]');
    expect(await widthOf(page, '[data-test="nav"]')).toBe(68);
    expect(await page.locator('[data-test="nav-notes.list"] span').count()).toBe(0);
    expect(await scrollsSideways(page)).toBe(false);

    await page.locator('[data-test="nav-toggle"]').click();
    expect(await widthOf(page, '[data-test="nav"]')).toBe(232);
    expect(await page.locator('[data-test="nav-notes.list"] span').count()).toBe(1);
    expect(await startOf(page, 'main')).toBe(68);

    await page.locator('[data-test="nav-kvwebui.extensions"]').click();
    await page.waitForURL('**/kvwebui/extensions');
    expect(await widthOf(page, '[data-test="nav"]')).toBe(68);
    expect(await scrollsSideways(page)).toBe(false);
    await page.close();
  });

  it('QA1-H5 a wide window keeps the full nav, collapsing only by its own toggle', async () => {
    const kvman = await started();
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(kvman.origin);
    await page.waitForSelector('[data-test="nav"]');
    expect(await widthOf(page, '[data-test="nav"]')).toBe(232);
    await page.locator('[data-test="nav-toggle"]').click();
    expect(await widthOf(page, '[data-test="nav"]')).toBe(68);
    await page.setViewportSize({ width: 390, height: 800 });
    expect(await widthOf(page, '[data-test="nav"]')).toBe(68);
    await page.setViewportSize({ width: 1280, height: 800 });
    expect(await widthOf(page, '[data-test="nav"]')).toBe(68);
    await page.close();
  });
});
