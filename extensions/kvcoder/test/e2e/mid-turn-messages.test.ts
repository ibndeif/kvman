import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { z } from '@kvman/sdk';
import { heldReply } from '../support/held-reply.ts';
import { kvmanWorld, until, type KvmanWorld } from '../support/kvman-child.ts';
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

describe('a running turn in Chromium (08 §8.7, ADR 0034, 8)', { timeout: 120_000 }, () => {
  it("QA47-H1 a message sent in an open chat, and each step's calls, show while the turn still runs", async () => {
    world = await kvmanWorld();
    const kvman = await world.start();
    world.fake.reply(says('first answer'));
    const sessionId = sessionSchema.parse(await kvman.call('commands', 'kvcoder.session.create', { title: 'Open' })).id;
    await kvman.call('commands', 'kvcoder.message.send', { sessionId, text: 'Say it' });
    await until(() => kvman.call('queries', 'kvcoder.session.get', { sessionId }), sessionSchema, (session) => session.status === 'idle');
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(`${kvman.origin}/kvcoder/session/${sessionId}`);
    await page.locator('[data-test="assistant-message"]').first().waitFor();

    const call = { toolCall: { id: 'call-echo', name: 'run', arguments: { description: 'Saying hi', connector: 'shell', command: 'exec', payload: { line: 'echo hi', risky: false } } } };
    const first = heldReply(call);
    const second = heldReply({ text: 'second answer' });
    world.fake.reply(first.reply, second.reply);
    await page.locator('[data-test="composer-text"]').fill('continue');
    await page.locator('[data-test="send"]').click();
    await page.locator('[data-test="user-message"]', { hasText: 'continue' }).waitFor({ timeout: 5000 });
    first.release();
    await page.locator('[data-test="call-card"]', { hasText: 'Saying hi' }).waitFor({ timeout: 5000 });
    expect(await page.locator('[data-test="assistant-message"]').count()).toBe(1);
    second.release();
    await page.locator('[data-test="assistant-message"]').nth(1).waitFor({ timeout: 5000 });
    await page.close();
  });
});
