import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { z } from '@kvman/sdk';
import { kvmanWorld, type KvmanWorld } from '../support/kvman-child.ts';
import { command, runs, says } from '../support/model-script.ts';

// The record card in Chromium against a real kvman (08 §8.5 and §8.7; ADR 0115, 24 to 29 and 49): Chromium's fake
// microphone records a take, the card uploads it as the person, and the answer writes it into the workspace and
// deletes the upload.

let browser: Browser;
let world: KvmanWorld | undefined;

beforeAll(async () => {
  browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
});

afterAll(async () => {
  await browser.close();
});

afterEach(async () => {
  await world?.close();
  world = undefined;
});

const sessionSchema = z.object({ id: z.string() });
const filesSchema = z.array(z.object({ id: z.string(), type: z.string() }));
const turnsSchema = z.array(z.object({ pending: z.array(z.object({ questionId: z.string().nullable() })) }));

const question = { prompt: 'Record the first scene', folder: 'videos/voice-1', tone: 'warm', lines: [{ text: 'This is Notes.', stress: ['notes'] }] };

describe('the record card in Chromium (08 §8.7, ADR 0115)', { timeout: 120_000 }, () => {
  it('M5.10-H1 M5.10-H4 a take recorded with the fake microphone is written into the workspace and its upload deleted', async () => {
    world = await kvmanWorld();
    const kvman = await world.start();
    world.fake.reply(runs(command('ask', 'record', question)), says('Done.'));
    const sessionId = sessionSchema.parse(await kvman.call('commands', 'kvcoder.session.create', { title: 'Voice' })).id;
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`${kvman.origin}/kvcoder/session/${sessionId}`);
    await page.locator('[data-test="composer-text"]').fill('Let me record it');
    await page.locator('[data-test="send"]').click();
    const card = page.locator('[data-test="record-card"]');
    await card.waitFor();
    expect(await card.locator('[data-test="record-stress"]').textContent()).toBe('Notes');
    expect(await card.locator('[data-test="record-use"]').isDisabled()).toBe(true);
    await card.locator('[data-test="record-start"]').click();
    await card.locator('[data-test="record-countdown"]').waitFor();
    await card.locator('[data-test="record-stop"]').waitFor({ timeout: 10_000 });
    await page.waitForTimeout(1200);
    await card.locator('[data-test="record-stop"]').click();
    await card.locator('[data-test="record-take"]').waitFor();
    await card.locator('[data-test="record-use"]').click();
    await page.locator('[data-test="answered-takes"]').waitFor();
    // The chat is in the Home workspace, the person's home folder.
    const take = path.join(path.dirname(world.home), 'user', 'videos', 'voice-1', 'line-1.webm');
    expect(existsSync(take)).toBe(true);
    expect(statSync(take).size).toBeGreaterThan(100);
    const files = filesSchema.parse(await kvman.call('queries', 'kernel.files.list', { limit: 50 }));
    expect(files.filter((file) => file.type.startsWith('audio/'))).toEqual([]);
  });

  it('M5.10-E2 a take over 25 MiB is refused and the question stays', async () => {
    world = await kvmanWorld();
    const kvman = await world.start();
    world.fake.reply(runs(command('ask', 'record', question)), says('Done.'));
    const sessionId = sessionSchema.parse(await kvman.call('commands', 'kvcoder.session.create', { title: 'Voice' })).id;
    await kvman.call('commands', 'kvcoder.message.send', { sessionId, text: 'Record' });
    const questionId = await (async () => {
      for (let tries = 0; tries < 100; tries += 1) {
        const found = turnsSchema.parse(await kvman.call('queries', 'kvcoder.turn.list', { sessionId, limit: 1 }))[0]?.pending[0]?.questionId;
        if (found !== undefined && found !== null) return found;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      throw new Error('no question came');
    })();
    const upload = await fetch(`${kvman.origin}/api/files?name=big.webm&workspaceId=home`, { method: 'POST', headers: { 'content-type': 'audio/webm' }, body: Buffer.alloc(25 * 1024 * 1024 + 1) });
    const fileId = z.object({ file: z.object({ id: z.string() }) }).parse(await upload.json()).file.id;
    await expect(kvman.call('commands', 'kvcoder.question.answer', { questionId, answer: { takes: [{ fileId, durationMs: 1000 }] } })).rejects.toThrow(/VALIDATION_FAILED|25 MiB/);
    expect(turnsSchema.parse(await kvman.call('queries', 'kvcoder.turn.list', { sessionId, limit: 1 }))[0]?.pending[0]?.questionId).toBe(questionId);
  });
});
