import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { z } from '@kvman/sdk';
import { kvmanWorld, type KvmanWorld } from '../support/kvman-child.ts';
import { command, runs } from '../support/model-script.ts';

let browser: Browser;
let world: KvmanWorld | undefined;
const idSchema = z.object({ id: z.string() });
beforeAll(async () => { browser = await chromium.launch(); });
afterAll(async () => { await browser.close(); });
afterEach(async () => { await world?.close(); world = undefined; });

describe('KVC21 Stop acceptance in Chromium', { timeout: 120_000 }, () => {
  it('M2.4-E145 Stop ends a turn that waits on a question', async () => {
    world = await kvmanWorld();
    const kvman = await world.start();
    world.fake.reply(runs(command('ask', 'text', { prompt: 'Your name?' })));
    const sessionId = idSchema.parse(await kvman.call('commands', 'kvcoder.session.create', { title: 'Stop while waiting' })).id;
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(`${kvman.origin}/kvcoder/session/${sessionId}?workspace=home`);
      await page.locator('[data-test="composer-text"]').fill('Ask me');
      await page.locator('[data-test="send"]').click();
      await page.locator('[data-test="question-card"]').waitFor();
      expect(await page.locator('[data-test="waiting-hint"]').textContent()).toContain('Stop ends the turn');
      await page.locator('[data-test="stop"]').click();
      await page.locator('[data-test="question-card"]').waitFor({ state: 'detached' });
      await page.locator('[data-test="notice"]', { hasText: 'You stopped this turn.' }).waitFor();
      await page.locator('[data-test="stop"]').waitFor({ state: 'detached' });
      expect(await page.locator('[data-test="stop-error"]').count()).toBe(0);
      expect(world.fake.requests()).toHaveLength(1);
      expect(errors).toEqual([]);
    } finally {
      await page.close();
    }
  });
});
