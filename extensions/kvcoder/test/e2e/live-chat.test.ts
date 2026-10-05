import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { z } from '@kvman/sdk';
import { childWait, kvmanWorld, until, type KvmanWorld } from '../support/kvman-child.ts';
import { command, runs, says } from '../support/model-script.ts';

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

describe('what a person sees while a step runs, in Chromium (08 §8.7, ADR 0009, 141–147)', { timeout: 120_000 }, () => {
  it('QA3-H2, QA3-H3, and QA3-H5 the card leaves at once, and the activity line shows the call being written while the model is still answering', async () => {
    world = await kvmanWorld();
    const kvman = await world.start();
    let release = (): void => undefined;
    const hold = new Promise<void>((resolve) => (release = resolve));
    const pieces = ['{"description":"Creating the todo file","connector":"shell","command":"exec",', '"payload":{"line":"echo hi","risky":false}}'];
    world.fake.reply(runs(command('ask', 'confirm', {"prompt":"Go on?"})), { chunks: [{ toolCall: { id: 'c9', name: 'run', argumentPieces: pieces } }, { wait: hold }] }, says('Done.'));
    const sessionId = sessionSchema.parse(await kvman.call('commands', 'kvcoder.session.create', { title: 'Live' })).id;
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(`${kvman.origin}/kvcoder/session/${sessionId}`);
    await page.locator('[data-test="composer-text"]').fill('Run it');
    await page.locator('[data-test="send"]').click();
    await page.locator('[data-test="question-card"]').waitFor();

    const activity = page.locator('[data-test="activity"]');
    try {
      await page.locator('[data-test="answer-yes"]').click();
      await page.locator('[data-test="question-card"]').waitFor({ state: 'detached', timeout: 2000 });
      await activity.waitFor();
      await activity.locator('[data-test="activity-title"]', { hasText: 'Creating the todo file' }).waitFor();
      expect(await activity.locator('[data-test="activity-label"]').textContent()).toBe('shell · exec');
      expect(await activity.getAttribute('data-phase')).toBe('preparing');
    } finally {
      release();
    }
    await page.locator('[data-test="assistant-message"]', { hasText: 'Done.' }).waitFor();
    await activity.waitFor({ state: 'detached' });
    const card = page.locator('[data-test="call-card"]', { hasText: 'Creating the todo file' });
    expect(await card.locator('[data-test="call-label"]').textContent()).toBe('shell · exec');
    await card.locator('button').click();
    expect(await card.locator('[data-test="call-payload"]').textContent()).toBe('echo hi');
    await page.close();
  });

  it("QA3-H8 and QA3-H10 the status bar shows the workspace folder (the home folder as ~) and the open chat's tokens and cost, and QA3-E10 the chat item is gone off a chat page", async () => {
    world = await kvmanWorld();
    const kvman = await world.start();
    world.fake.reply({ chunks: [{ text: 'Hello. '.repeat(70) }], usage: { input: 4200, output: 1100 } });
    const sessionId = sessionSchema.parse(await kvman.call('commands', 'kvcoder.session.create', { title: 'Costs' })).id;
    await kvman.call('commands', 'kvcoder.message.send', { sessionId, text: 'Hi' });
    await until(() => kvman.call('queries', 'kvcoder.session.get', { sessionId }), sessionSchema, (session) => session.status === 'idle');
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(`${kvman.origin}/kvcoder/session/${sessionId}`);
    await page.locator('[data-test="assistant-message"]').waitFor();
    const bar = page.locator('[data-test="status-bar"]');
    await vi.waitFor(async () => expect(await bar.textContent()).toContain('Chat ↑ 4.2K ↓ 1.1K · $0.00'), childWait);
    expect(await page.locator('[data-test="status-workspace"]').getAttribute('title')).toMatch(/user$/);
    expect(await page.locator('[data-test="status-workspace"]').textContent()).toContain('~');
    expect(await bar.locator('> *').first().getAttribute('data-test')).toBe('status-workspace');
    await page.locator('[data-test="nav-kvwebui.settings"]').click();
    await page.locator('[data-test="status-kvcoder.waiting"]').waitFor();
    expect(await page.locator('[data-test="status-kvcoder.chat"]').count()).toBe(0);
    await page.close();
  });
});
