import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { z } from '@kvman/sdk';
import { childWait, kvmanWorld, type KvmanWorld } from '../support/kvman-child.ts';

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

// A point the fake model's answer waits at until the test releases it.
function gate(): { wait: Promise<void>; release(): void } {
  let release = (): void => undefined;
  const wait = new Promise<void>((resolve) => (release = resolve));
  return { wait, release: () => release() };
}

describe('the conversation in Chromium (08 §8.7)', { timeout: 120_000 }, () => {
  it('M2.4-H12 the conversation reattaches to a running step after a reload', async () => {
    world = await kvmanWorld();
    const kvman = await world.start();
    const [begin, middle, end] = [gate(), gate(), gate()];
    world.fake.reply({ chunks: [{ wait: begin.wait }, { text: 'Hello ' }, { wait: middle.wait }, { text: 'world' }, { wait: end.wait }, { text: '!' }] });
    const sessionId = sessionSchema.parse(await kvman.call('commands', 'kvcoder.session.create', { title: 'Reattach' })).id;
    const page = await browser.newPage();
    await page.goto(`${kvman.origin}/kvcoder/session/${sessionId}`);
    await page.locator('[data-test="conversation"]').waitFor();
    // The page's stream may connect after a chunk went out (plan 08 §8.7), so each chunk waits for the stream to connect.
    const streamed = () => page.waitForRequest((request) => /\/api\/jobs\/[^/]+\/stream$/.test(new URL(request.url()).pathname));
    await page.locator('[data-test="composer-text"]').fill('Say hello');
    const firstStream = streamed();
    await page.locator('[data-test="send"]').click();
    await firstStream;
    await vi.waitFor(() => expect(world?.fake.requests()).toHaveLength(1), childWait);
    begin.release();
    await page.locator('[data-test="live-answer"]', { hasText: 'Hello' }).waitFor();

    const secondStream = streamed();
    await page.reload();
    await page.locator('[data-test="conversation"]').waitFor();
    await secondStream;
    middle.release();
    await page.locator('[data-test="live-answer"]', { hasText: 'world' }).waitFor();
    end.release();
    await page.locator('[data-test="assistant-message"]', { hasText: 'Hello world!' }).waitFor();
    expect(await page.locator('[data-test="live-answer"]').count()).toBe(0);
    await page.close();
  });
});
