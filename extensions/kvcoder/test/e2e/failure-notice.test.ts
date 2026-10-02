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

const sessionSchema = z.object({ id: z.string() });

describe('a failed model call in Chromium (08 §8.7, ADR 0009, 156)', { timeout: 120_000 }, () => {
  it("QA3-H24 the notice says which model failed and the provider's reason", async () => {
    world = await kvmanWorld();
    const kvman = await world.start();
    world.fake.reply({ status: 400, body: { error: { message: 'The model does not like this.', type: 'invalid_request_error' } } });
    const sessionId = sessionSchema.parse(await kvman.call('commands', 'kvcoder.session.create', { title: 'Failing' })).id;
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(`${kvman.origin}/kvcoder/session/${sessionId}`);
    await page.locator('[data-test="composer-text"]').fill('Say something');
    await page.locator('[data-test="send"]').click();
    const notice = page.locator('[data-test="notice"]');
    await notice.waitFor();
    const text = (await notice.textContent()) ?? '';
    expect(text).toContain('The turn stopped: The call to fake/m1 failed. 400: ');
    expect(text).toContain('The model does not like this.');
    await page.close();
  });
});
