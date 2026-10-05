import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { z } from '@kvman/sdk';
import { heldReply } from '../support/held-reply.ts';
import { kvmanWorld, until, type KvmanWorld } from '../support/kvman-child.ts';
import { padded } from '../support/long-messages.ts';
import { says } from '../support/model-script.ts';

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

const sessionSchema = z.object({ id: z.string(), status: z.string() });

describe("a running chat action's progress in Chromium (08 §8.7, ADR 0019)", { timeout: 120_000 }, () => {
  it('QA26-H7 /compact shows its line while the model summarizes, blocks Send, and ends with the summary and its toast', async () => {
    world = await kvmanWorld();
    const kvman = await world.start();
    const sessionId = sessionSchema.parse(await kvman.call('commands', 'kvcoder.session.create', { title: 'Long' })).id;
    for (const index of [1, 2, 3, 4, 5, 6, 7]) {
      world.fake.reply(says(`answer ${index}`));
      await kvman.call('commands', 'kvcoder.message.send', { sessionId, text: padded(`message ${index}`) });
      await until(() => kvman.call('queries', 'kvcoder.session.get', { sessionId }), sessionSchema, (found) => found.status === 'idle');
    }
    const held = heldReply({ text: 'SUMMARY' });
    world.fake.reply(held.reply);
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(`${kvman.origin}/kvcoder/session/${sessionId}`);
    await page.locator('[data-test="composer-text"]').fill('/compact');
    await page.keyboard.press('Enter');

    const line = page.locator('[data-test="command-progress"]');
    await line.waitFor();
    expect(await line.locator('[data-test="command-title"]').textContent()).toBe('Summarizing earlier messages…');
    const box = await line.boundingBox();
    expect((box?.y ?? 800) + (box?.height ?? 0)).toBeLessThanOrEqual(800);
    await page.locator('[data-test="composer-text"]').fill('next');
    expect(await page.locator('[data-test="send"]').isDisabled()).toBe(true);

    held.release();
    await line.waitFor({ state: 'detached' });
    await page.locator('[data-test="summary"]').waitFor();
    await page.locator('[role="status"][data-level="success"]', { hasText: 'Earlier messages were summarized' }).waitFor();
    expect(await page.locator('[data-test="send"]').isDisabled()).toBe(false);
    await page.close();
  });
});
