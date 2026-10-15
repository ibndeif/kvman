import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { startKvman, type RunningKvman } from './support/kvman.ts';

let browser: Browser;
let kvman: RunningKvman;

beforeAll(async () => {
  browser = await chromium.launch();
  kvman = await startKvman('en', {
    'kvwebui.nav.hidden': ['kvwebui.settings', 'kvwebui.extensions', 'notes.list'],
    'kvwebui.status.hidden': ['kvwebui.folder'],
    'kvwebui.workspacePicker': false,
  });
});

afterAll(async () => {
  await browser.close();
  await kvman.close();
});

// Page expressions are strings: they run in Chromium, where the DOM is, not in this Node process.
describe('a preset hides developer screens (06 §6.2, ADR 0082, 12)', { timeout: 60_000 }, () => {
  it('QA52-H13 hidden nav items, the folder, and the workspace picker are gone, and a hidden page still opens by its address', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(kvman.url);
    await page.waitForSelector('[data-test="nav"]');
    await page.waitForSelector('[data-test="status-bar"]');
    for (const id of ['kvwebui.settings', 'kvwebui.extensions', 'notes.list']) expect(await page.locator(`[data-test="nav-${id}"]`).count(), id).toBe(0);
    expect(await page.locator('[data-test="nav"] hr').count()).toBe(0);
    expect(await page.locator('button[aria-label^="Workspace:"]').count()).toBe(0);
    expect(await page.locator('[data-test="status-workspace"]').count()).toBe(0);
    await page.goto(new URL('kvwebui/settings', kvman.origin).href);
    await page.waitForSelector('[data-test="settings-search"]');
    await page.close();
  });
});
