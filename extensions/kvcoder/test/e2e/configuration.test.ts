import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { z } from '@kvman/sdk';
import { kvmanWorld, type KvmanWorld } from '../support/kvman-child.ts';

let browser: Browser;
let world: KvmanWorld | undefined;

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser.close();
});

afterEach(async () => {
  await world?.close();
  world = undefined;
});

const settingsSchema = z.array(z.object({ key: z.string(), value: z.json(), source: z.string() }));

describe("kvcoder's configuration in Chromium (06 §6.6, 08 §8.7, ADR 0014)", { timeout: 120_000 }, () => {
  it("QA21-H13 the person opens Coder from Extensions and turns fs off, it stays off after a reload, and Settings shows only kvman's own rows", async () => {
    world = await kvmanWorld();
    const kvman = await world.start();
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`${kvman.origin}/kvwebui/extensions`);
    await page.locator('[data-test="extension-kvcoder"]').click();
    await page.locator('[data-test="extension-page-kvcoder"]').waitFor();
    expect(await page.locator('[data-test="extension-title"]').textContent()).toBe('Coder');
    expect(await page.locator('[data-test="setting-kvcoder.thinking"] select').count()).toBe(1);

    const names = page.locator('[data-test="connectors"] [data-test="connector-name"]');
    await names.first().waitFor();
    expect(await names.allTextContents()).toEqual(['shell', 'fs', 'artifact', 'background', 'ask', 'subagent']);
    const fs = page.locator('[data-test="connector-fs"] [data-test="connector-switch"]');
    expect(await fs.getAttribute('aria-checked')).toBe('true');
    await fs.click();
    await page.locator('[data-test="connector-fs"] [data-test="connector-switch"][aria-checked="false"]').waitFor();
    const stored = settingsSchema.parse(await kvman.call('queries', 'kernel.settings.list', {})).find((setting) => setting.key === 'kvcoder.connectors.disabled');
    expect(stored).toMatchObject({ value: ['fs'], source: 'global' });

    await page.reload();
    await page.locator('[data-test="connector-fs"] [data-test="connector-switch"][aria-checked="false"]').waitFor();
    expect(await page.locator('[data-test="connector-shell"] [data-test="connector-switch"]').getAttribute('aria-checked')).toBe('true');

    await page.goto(`${kvman.origin}/kvwebui/settings`);
    const rows = page.locator('[data-test="settings-general"] > [data-test^="setting-"]');
    await rows.first().waitFor();
    const keys = await rows.evaluateAll((found) => found.map((row) => row.getAttribute('data-test') ?? ''));
    expect(keys.length).toBeGreaterThan(3);
    expect(keys.filter((key) => !key.startsWith('setting-kernel.'))).toEqual([]);
    expect(await page.locator('[data-test^="scope-"]').count()).toBe(0);
    await page.close();
  });
});
