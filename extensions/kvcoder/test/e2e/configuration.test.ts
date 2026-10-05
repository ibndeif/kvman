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
    expect(await names.allTextContents()).toEqual(['shell', 'fs', 'artifact', 'background', 'ask', 'delegate', 'mcp']);
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

  it("QA28-H8 the person sets when the shell asks from its cog: the dialog covers the page, saves, closes on Escape, and holds after a reload", async () => {
    world = await kvmanWorld();
    const kvman = await world.start();
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`${kvman.origin}/kvwebui/extension/kvcoder`);
    const cog = page.locator('[data-test="connector-shell"] [data-test="connector-configure"]');
    await cog.click();
    const select = page.locator('[data-test="shell-approval-control"]');
    await select.waitFor();
    expect(await page.locator('[data-test="connector-dialog-backdrop"]').boundingBox()).toEqual({ x: 0, y: 0, width: 1280, height: 900 });
    expect(await page.locator('[data-test^="setting-kvcoder.shell"], [data-test="connector-fs"] [data-test="connector-configure"]').count()).toBe(0);
    await select.selectOption('ask');
    await page.locator('[data-test="shell-approval-saved"]').waitFor();
    const stored = settingsSchema.parse(await kvman.call('queries', 'kernel.settings.list', {})).find((setting) => setting.key === 'kvcoder.shell.approval');
    expect(stored).toMatchObject({ value: 'ask', source: 'global' });

    await page.keyboard.press('Escape');
    await page.locator('[data-test="connector-dialog"]').waitFor({ state: 'detached' });
    expect(await page.locator('[data-test="connector-shell"] [data-test="connector-configure"]:focus').count()).toBe(1);

    await page.reload();
    await cog.click();
    await expect.poll(() => select.inputValue()).toBe('ask');
    await page.close();
  });

  it("QA31-H18 the person turns the reviewer off from delegate's cog, and it stays off after a reload", async () => {
    world = await kvmanWorld();
    const kvman = await world.start();
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`${kvman.origin}/kvwebui/extension/kvcoder`);
    const cog = page.locator('[data-test="connector-delegate"] [data-test="connector-configure"]');
    await cog.click();
    const names = page.locator('[data-test="workers"] [data-test="worker-name"]');
    await names.first().waitFor();
    expect(await names.allTextContents()).toEqual(['general', 'ui-ux', 'architect', 'tester', 'reviewer']);
    const reviewer = page.locator('[data-test="worker-reviewer"] [data-test="worker-switch"]');
    expect(await reviewer.getAttribute('aria-checked')).toBe('true');
    await reviewer.click();
    await page.locator('[data-test="worker-reviewer"] [data-test="worker-switch"][aria-checked="false"]').waitFor();
    const stored = settingsSchema.parse(await kvman.call('queries', 'kernel.settings.list', {})).find((setting) => setting.key === 'kvcoder.delegate.workers');
    expect(stored?.source).toBe('global');
    expect(stored?.value).toMatchObject([{ name: 'general', enabled: true }, { name: 'ui-ux', enabled: true }, { name: 'architect', enabled: true }, { name: 'tester', enabled: true }, { name: 'reviewer', enabled: false }]);

    await page.reload();
    await cog.click();
    await page.locator('[data-test="worker-reviewer"] [data-test="worker-switch"][aria-checked="false"]').waitFor();
    expect(await page.locator('[data-test="worker-general"] [data-test="worker-switch"]').getAttribute('aria-checked')).toBe('true');
    await page.close();
  });

  it('QA32-H17 the person adds a Claude Code worker, and its row and its entry hold after a reload', async () => {
    world = await kvmanWorld();
    const kvman = await world.start();
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`${kvman.origin}/kvwebui/extension/kvcoder`);
    const cog = page.locator('[data-test="connector-delegate"] [data-test="connector-configure"]');
    await cog.click();
    await page.locator('[data-test="worker-add"]').click();
    await page.locator('[data-test="worker-kind-select"]').selectOption('claude');
    await page.locator('[data-test="worker-name"]').fill('second-opinion');
    await page.locator('[data-test="worker-description"]').fill('A second opinion on a design');
    expect(await page.locator('[data-test="worker-permission-mode"]').inputValue()).toBe('acceptEdits');
    await page.locator('[data-test="worker-save"]').click();
    const row = page.locator('[data-test="worker-second-opinion"]');
    await row.waitFor();
    expect(await row.locator('[data-test="worker-kind"]').textContent()).toBe('Claude Code');
    const stored = settingsSchema.parse(await kvman.call('queries', 'kernel.settings.list', {})).find((setting) => setting.key === 'kvcoder.delegate.workers');
    expect((stored?.value as unknown[]).at(-1)).toEqual({ name: 'second-opinion', description: 'A second opinion on a design', enabled: true, kind: 'claude', instructions: '', approval: 'ask', timeoutMs: 1_800_000, model: null, effort: null, permissionMode: 'acceptEdits' });

    await page.reload();
    await cog.click();
    await row.waitFor();
    expect(await row.locator('[data-test="worker-kind"]').textContent()).toBe('Claude Code');
    await page.close();
  });

  it('QA22-H8 Coder and AI pick their model from a dropdown, Coder lists no programs field, and Interface has only its theme', async () => {
    world = await kvmanWorld();
    const kvman = await world.start();
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`${kvman.origin}/kvwebui/extension/kvcoder`);
    const coder = page.locator('[data-test="model-setting"] [data-test="model-picker"]');
    await coder.waitFor();
    await page.locator('[data-test="connectors"] [data-test="connector-name"]').first().waitFor();
    expect(await page.locator('[data-test="setting-kvcoder.model"], [data-test="setting-kvcoder.connectors"], [data-test="connector-origin"]').count()).toBe(0);
    await coder.click();
    await page.locator('[data-test="model-setting"] [data-test="model-search"]').waitFor();
    expect(await page.locator('[data-test="model-none-entry"]').getAttribute('aria-selected')).toBe('true');
    const box = await page.locator('[data-test="model-popover"]').boundingBox();
    expect(box !== null && box.x >= 0 && box.x + box.width <= 1280).toBe(true);

    await page.goto(`${kvman.origin}/kvwebui/extension/kvai`);
    const ai = page.locator('[data-test="default-model-setting"] [data-test="default-model-button"]');
    await ai.waitFor();
    expect(await page.locator('[data-test="setting-kvai.defaultModel"]').count()).toBe(0);
    await ai.click();
    await page.locator('[data-test="default-model-setting"] [data-test="picker-search"]').waitFor();
    const popover = await page.locator('[data-test="default-model-setting"] [data-test="model-picker"]').boundingBox();
    expect(popover !== null && popover.x >= 0 && popover.x + popover.width <= 1280).toBe(true);

    await page.goto(`${kvman.origin}/kvwebui/extension/kvwebui`);
    await page.locator('[data-test="setting-kvwebui.theme"]').waitFor();
    expect(await page.locator('[data-test^="setting-kvwebui."]').evaluateAll((rows) => rows.map((row) => row.getAttribute('data-test')))).toEqual(['setting-kvwebui.theme']);
    await page.close();
  });
});
