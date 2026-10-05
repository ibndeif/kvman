import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { z } from '@kvman/sdk';
import { kvmanWorld, until, type KvmanWorld } from '../support/kvman-child.ts';
import { command, fsCall, runs, says } from '../support/model-script.ts';

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

const rectOf = (page: Page, selector: string) => page.locator(selector).first().evaluate((element) => {
  const { x, y, width, height } = element.getBoundingClientRect();
  return { x, y, width, height, right: x + width, bottom: y + height };
});

describe('the conversation view in Chromium (08 §8.7, ADR 0017)', { timeout: 120_000 }, () => {
  it('QA24-H12 a call shows its whole wait, the menu closes outside, the model list opens above the send box, /prompt shows the prompt, and the artifact header is one row', async () => {
    world = await kvmanWorld();
    const kvman = await world.start();
    world.fake.reply(runs(fsCall('write', { path: 'notes.txt', content: 'hello' })), runs(command('artifact', 'write', { id: 'plan', title: 'The plan', content: '# The plan' })), says('Done.'));
    const sessionId = sessionSchema.parse(await kvman.call('commands', 'kvcoder.session.create', { title: 'Review' })).id;
    await kvman.call('commands', 'kvcoder.message.send', { sessionId, text: 'Write the notes' });
    await until(() => kvman.call('queries', 'kvcoder.session.get', { sessionId }), sessionSchema, (found) => found.status === 'idle');
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(`${kvman.origin}/kvcoder/session/${sessionId}`);

    const time = page.locator('[data-test="call-card"] [data-test="call-time"]').first();
    await time.waitFor();
    expect(await time.textContent()).toMatch(/^[1-9]\d* ms$|^\d\.\d s$/);
    await page.locator('[data-test="call-card"] button').first().click();
    expect(await page.locator('[data-test="call-parts"]').textContent()).toMatch(/^Written in .+ · ran in \d+ ms$/);
    expect(await page.locator('[data-test="call-failed"]').count()).toBe(0);

    await page.locator('[data-test="chat-menu"]').click();
    await page.locator('[data-test="chat-menu-items"]').waitFor();
    await page.locator('[data-test="composer-text"]').click();
    await page.locator('[data-test="chat-menu-items"]').waitFor({ state: 'detached' });

    expect(await page.locator('.kvc-header [data-test="model-picker"]').count()).toBe(0);
    await page.locator('.kvc-composer [data-test="model-picker"]').click();
    await page.locator('[data-test="model-popover"]').waitFor();
    const popover = await rectOf(page, '[data-test="model-popover"]');
    const button = await rectOf(page, '.kvc-composer [data-test="model-picker"]');
    expect(popover.bottom).toBeLessThanOrEqual(button.y);
    expect(popover.y).toBeGreaterThanOrEqual(0);
    await page.keyboard.press('Escape');

    await page.locator('[data-test="artifact-open"]').first().click();
    await page.locator('[data-test="artifact-panel"]').waitFor();
    const tops = await page.locator('[data-test="artifact-title"], [data-test="artifact-view-preview"], [data-test="artifact-copy"], [data-test="artifact-close"]').evaluateAll((parts) => parts.map((part) => Math.round(part.getBoundingClientRect().bottom)));
    const head = await rectOf(page, '.kvc-artifact-head');
    expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(head.height / 2);
    expect(head.height).toBeLessThan(80);
    const icons = await page.locator('.kvc-icon-button svg').evaluateAll((found) => found.map((icon) => Math.round(icon.getBoundingClientRect().width)));
    expect(icons).toEqual([16, 16]);
    await page.locator('[data-test="artifact-close"]').click();

    await page.locator('[data-test="composer-text"]').fill('/pro');
    expect(await page.locator('.kvc-slash-row').count()).toBe(1);
    const list = await rectOf(page, '[data-test="slash-list"]');
    expect(list.bottom).toBeLessThanOrEqual((await rectOf(page, '[data-test="composer-text"]')).y);
    await page.keyboard.press('Enter');
    await page.locator('[data-test="prompt-text"]').waitFor();
    expect(await page.locator('[data-test="composer-text"]').inputValue()).toBe('');
    await page.locator('[data-test="prompt-back"]').click();
    await page.locator('[data-test="user-message"]').first().waitFor();
    await page.close();
  });
});
