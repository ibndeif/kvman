import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { z } from '@kvman/sdk';
import { kvmanWorld, type KvmanWorld } from '../support/kvman-child.ts';
import { says } from '../support/model-script.ts';

let browser: Browser;
let world: KvmanWorld | undefined;
const idSchema = z.object({ id: z.string() });
beforeAll(async () => { browser = await chromium.launch(); });
afterAll(async () => { await browser.close(); });
afterEach(async () => { await world?.close(); world = undefined; });

describe('KVC19 message draft acceptance in Chromium', { timeout: 120_000 }, () => {
  it('M2.4-E141 a send whose reply was lost keeps its draft across pages, and the retry adds the message once', async () => {
    world = await kvmanWorld();
    const kvman = await world.start();
    world.fake.reply(says('Done.'));
    const sessionId = idSchema.parse(await kvman.call('commands', 'kvcoder.session.create', { title: 'Draft message' })).id;
    const away = idSchema.parse(await kvman.call('commands', 'kvcoder.session.create', { title: 'Away' })).id;
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    let requests = 0;
    try {
      // The first send reaches kvman and is accepted; only its reply is lost.
      await page.route('**/api/commands/kvcoder.message.send', async route => {
        requests += 1;
        if (requests > 1) { await route.continue(); return; }
        await route.fetch();
        await route.abort('failed');
      });
      await page.goto(`${kvman.origin}/kvcoder/session/${sessionId}?workspace=home`);
      await page.locator('[data-test="composer-text"]').fill('Make a notes page');
      await page.locator('[data-test="send"]').click();
      await page.locator('[data-test="send-error"]').waitFor();
      expect(await page.locator('[data-test="composer-text"]').inputValue()).toBe('Make a notes page');
      await page.evaluate("document.documentElement.dataset.draftNavigation = 'same-document'");
      await page.locator(`[data-test="session-${away}"]`).click();
      await page.locator('[data-test="session-title"]', { hasText: 'Away' }).waitFor();
      expect(await page.locator('[data-test="composer-text"]').inputValue()).toBe('');
      await page.locator(`[data-test="session-${sessionId}"]`).click();
      await page.locator('[data-test="session-title"]', { hasText: 'Draft message' }).waitFor();
      expect(await page.evaluate('document.documentElement.dataset.draftNavigation')).toBe('same-document');
      expect(await page.locator('[data-test="composer-text"]').inputValue()).toBe('Make a notes page');
      await page.locator('[data-test="send"]').click();
      await expect.poll(() => page.locator('[data-test="composer-text"]').inputValue()).toBe('');
      await page.getByText('Done.').waitFor();
      expect(requests).toBe(2);
      expect(await page.locator('[data-test="send-error"]').count()).toBe(0);
      expect(await page.getByText('Make a notes page').count()).toBe(1);
      expect(world.fake.requests()).toHaveLength(1);
      expect(errors).toEqual([]);
    } finally {
      await page.close();
    }
  });
});
