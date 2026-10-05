import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { kvmanWorld, type KvmanWorld } from '../support/kvman-child.ts';
import { startOAuthFixture, type OAuthFixture } from '../support/mcp-oauth-fixture.ts';

let browser: Browser;
let world: KvmanWorld | undefined;
let fixture: OAuthFixture | undefined;

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser.close();
});

afterEach(async () => {
  await world?.close();
  await fixture?.close();
  world = undefined;
  fixture = undefined;
});

describe('signing in to an MCP server in Chromium (08 §8.7, ADR 0020, 8 and 11)', { timeout: 120_000 }, () => {
  it("QA30-H10 Sign in opens a tab that goes through the server and lands on kvcoder's page; back in the first tab the server is ready", async () => {
    fixture = await startOAuthFixture();
    world = await kvmanWorld();
    const kvman = await world.start();
    await kvman.call('commands', 'kernel.settings.set', { key: 'kvcoder.mcp.servers', scope: 'global', value: [{ name: 'remote', description: 'Needs a sign-in.', url: fixture.url, headers: [] }] });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await page.goto(`${kvman.origin}/kvwebui/extension/kvcoder`);
    await page.locator('[data-test="connector-mcp"] [data-test="connector-configure"]').click();
    const state = page.locator('[data-test="mcp-server-remote"] [data-test="mcp-server-state"]');
    await page.locator('[data-test="mcp-server-remote"] [data-test="mcp-server-state"][data-status="signInNeeded"]').waitFor();

    const [tab] = await Promise.all([context.waitForEvent('page'), page.locator('[data-test="mcp-server-sign-in"]').click()]);
    await tab.locator('[data-test="mcp-sign-in"][data-outcome="done"]').waitFor();
    expect(new URL(tab.url()).pathname).toBe('/kvcoder/mcp-sign-in');
    expect(await tab.locator('[data-test="mcp-sign-in-title"]').textContent()).toBe('Signed in to remote.');
    await tab.close();

    await page.bringToFront();
    // A headless page isn't given the focus back when another tab closes, so the event is sent as the browser would.
    await page.evaluate("window.dispatchEvent(new Event('focus'))");
    await page.locator('[data-test="mcp-server-remote"] [data-test="mcp-server-state"][data-status="ready"]').waitFor();
    expect(await state.textContent()).toContain('Ready · 8 tools');
    expect(await page.locator('[data-test="mcp-server-sign-out"]').count()).toBe(1);
    expect(fixture.bearers.at(-1)).toBe('Bearer access-1-SECRET');
    await context.close();
  });
});
