import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { z } from '@kvman/sdk';
import { kvmanWorld, until, type KvmanWorld } from '../support/kvman-child.ts';
import { says } from '../support/model-script.ts';

let browser: Browser;
let world: KvmanWorld | undefined;
beforeAll(async () => { browser = await chromium.launch(); });
afterAll(async () => { await browser.close(); });
afterEach(async () => { await world?.close(); world = undefined; });

const sessionSchema = z.object({ id: z.string(), status: z.string(), thinking: z.string() });
const levels = ['off', 'minimal', 'low', 'medium', 'high'];

describe('the thinking level of the send box in Chromium (08 §8.7, ADR 0071, 5)', { timeout: 120_000 }, () => {
  it('QA50-H6 the five levels open above the button, inside the window, and a pick configures the chat', async () => {
    world = await kvmanWorld();
    const kvman = await world.start();
    world.fake.reply(says('Hello.'));
    const sessionId = sessionSchema.parse(await kvman.call('commands', 'kvcoder.session.create', { title: 'Thinking' })).id;
    await kvman.call('commands', 'kvcoder.message.send', { sessionId, text: 'Hi' });
    await until(() => kvman.call('queries', 'kvcoder.session.get', { sessionId }), sessionSchema, (found) => found.status === 'idle');
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(`${kvman.origin}/kvcoder/session/${sessionId}`);
    const button = page.locator('.kvc-composer [data-test="thinking-picker"]');
    await button.waitFor();
    expect(await button.textContent()).toBe('Medium');
    await button.click();
    const top = (await button.boundingBox())?.y ?? 0;
    const options = page.locator('[data-test="thinking-picker-list"] [role="option"]');
    expect(await options.allTextContents()).toEqual(['Off', 'Minimal', 'Low', 'Medium', 'High']);
    expect(await options.evaluateAll((found) => found.map((option) => option.getAttribute('aria-selected')))).toEqual(['false', 'false', 'false', 'true', 'false']);
    for (const level of levels) {
      const box = await page.locator(`[data-test="thinking-picker-${level}"]`).boundingBox();
      if (box === null) throw new Error(`the level ${level} isn't shown`);
      expect(box.y, level).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height, level).toBeLessThanOrEqual(top);
      expect(box.x, level).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, level).toBeLessThanOrEqual(1280);
    }
    await page.locator('[data-test="thinking-picker-high"]').click();
    await page.locator('[data-test="thinking-picker-list"]').waitFor({ state: 'detached' });
    await until(() => kvman.call('queries', 'kvcoder.session.get', { sessionId }), sessionSchema, (found) => found.thinking === 'high');
    await page.locator('.kvc-composer [data-test="thinking-picker"]', { hasText: 'High' }).waitFor();
    await page.close();
  });
});
