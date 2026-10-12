import { readFileSync } from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright';
import { z } from '@kvman/sdk';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { kvmanWorld, type KvmanWorld } from '../support/kvman-child.ts';

let browser: Browser;
let world: KvmanWorld | undefined;
const catalog = z.record(z.string(), z.string()).parse(JSON.parse(readFileSync(new URL('../../locales/en.json', import.meta.url), 'utf8')));
const approvalKey = 'kvcoder.shell.approval';
const settingsSchema = z.array(z.object({ key: z.string(), value: z.json(), source: z.string() }));

function copy(kind: 'ask' | 'auto' | 'limits'): string {
  const value = catalog[`kvcoder.ui.approvalNote.${kind}`];
  if (value === undefined) throw new Error(`Missing approval note copy: ${kind}`);
  return value;
}
async function mode(page: Page, expected: 'ask' | 'auto'): Promise<void> {
  await page.locator('[data-test="approval-mode"]').waitFor();
  await expect.poll(() => page.locator('[data-test="approval-mode"]').textContent()).toBe(copy(expected));
  expect(await page.locator('[data-test="approval-limits"]').textContent()).toBe(copy('limits'));
}

beforeAll(async () => { browser = await chromium.launch(); });
afterAll(async () => { await browser.close(); });
afterEach(async () => { await world?.close(); world = undefined; });

describe('KVC22 effective approval acceptance in Chromium', { timeout: 120_000 }, () => {
  it('M2.4-E129 opens Coder configuration directly and refreshes mode after save/reset without reloading', async () => {
    world = await kvmanWorld();
    const kvman = await world.start();
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(`${kvman.origin}/kvcoder/chat?workspace=home`);
      await mode(page, 'auto');
      expect(copy('auto')).toContain('model supplies the risky flag');
      expect(copy('auto')).toContain('risky:false may run without approval');
      expect(copy('auto')).toContain('Registered commands marked as needing approval still ask');
      expect(copy('limits')).toContain('not sandboxing');
      expect(copy('limits')).toContain('model and its providers');
      await page.locator('[data-test="approval-config"]').click();
      await page.locator('[data-test="extension-page-kvcoder"]').waitFor();
      expect(new URL(page.url()).pathname).toBe('/kvwebui/extension/kvcoder');
      await page.locator('[data-test="connector-shell"] [data-test="connector-configure"]').click();
      await mode(page, 'auto');
      await page.locator('[data-test="shell-approval-control"]').selectOption('ask');
      await mode(page, 'ask');
      expect(copy('ask')).not.toContain('every command');
      expect(copy('ask')).toContain('reads and help do not all require approval');
      const saved = settingsSchema.parse(await kvman.call('queries', 'kernel.settings.list', {})).find(setting => setting.key === approvalKey);
      expect(saved).toMatchObject({ value: 'ask', source: 'global' });
      await page.locator('[data-test="shell-approval-reset"]').click();
      await mode(page, 'auto');
      await page.goto(`${kvman.origin}/kvcoder/chat?workspace=home`);
      await mode(page, 'auto');
      expect(errors).toEqual([]);
    } finally { await page.close(); }
  });

  it('M2.4-E130 honors workspace precedence and reset instead of inferring the auto default', async () => {
    world = await kvmanWorld();
    const kvman = await world.start();
    await kvman.call('commands', 'kernel.settings.set', { key: approvalKey, value: 'ask', scope: 'global' });
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(`${kvman.origin}/kvcoder/chat?workspace=home`);
      await mode(page, 'ask');
      await page.locator('[data-test="approval-config"]').click();
      await page.locator('[data-test="extension-page-kvcoder"]').waitFor();
      await page.locator('[data-test="scope-workspace"]').click();
      await page.locator('[data-test="connector-shell"] [data-test="connector-configure"]').click();
      await mode(page, 'ask');
      const control = page.locator('[data-test="shell-approval-control"]');
      await control.selectOption('auto');
      await mode(page, 'auto');
      await page.keyboard.press('Escape');
      await page.locator('[data-test="connector-dialog"]').waitFor({ state: 'detached' });
      await page.locator('[data-test="scope-global"]').click();
      await page.locator('[data-test="connector-shell"] [data-test="connector-configure"]').click();
      await mode(page, 'auto');
      expect(await control.isDisabled()).toBe(true);
      expect(await page.locator('[data-test="shell-approval-own-value"]').count()).toBe(1);
      expect(await page.locator('[data-test="shell-approval-reset"]').count()).toBe(0);
      await page.keyboard.press('Escape');
      await page.locator('[data-test="connector-dialog"]').waitFor({ state: 'detached' });
      await page.locator('[data-test="scope-workspace"]').click();
      await page.locator('[data-test="connector-shell"] [data-test="connector-configure"]').click();
      await page.locator('[data-test="shell-approval-reset"]').click();
      await mode(page, 'ask');
      await page.goto(`${kvman.origin}/kvcoder/chat?workspace=home`);
      await mode(page, 'ask');
      expect(errors).toEqual([]);
    } finally { await page.close(); }
  });
});
