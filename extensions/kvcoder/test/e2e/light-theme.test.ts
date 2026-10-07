import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { z } from '@kvman/sdk';
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

// The expression is a string: it runs in Chromium, where the DOM is, not in this Node process.
const colorOf = async (page: Page, selector: string, property: 'backgroundColor' | 'color'): Promise<string> => z.string().parse(await page.evaluate(`getComputedStyle(document.querySelector(${JSON.stringify(selector)})).${property}`));

describe('the light theme in Chromium (06 §6.4, ADR 0037, 3)', { timeout: 120_000 }, () => {
  it('QA49-H4 the light theme is soft slate, with nothing pure white, and the dark theme is as it was', async () => {
    world = await kvmanWorld();
    const kvman = await world.start();
    world.fake.reply(says('Hi.'));
    const sessionId = sessionSchema.parse(await kvman.call('commands', 'kvcoder.session.create', { title: 'Colors' })).id;
    await kvman.call('commands', 'kvcoder.message.send', { sessionId, text: 'Hello' });
    await until(() => kvman.call('queries', 'kvcoder.session.get', { sessionId }), sessionSchema, (found) => found.status === 'idle');
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, colorScheme: 'light' });
    await page.goto(`${kvman.origin}/kvcoder/session/${sessionId}`);
    await page.locator('[data-test="assistant-message"]').waitFor();
    expect(await colorOf(page, 'body', 'backgroundColor')).toBe('rgb(233, 237, 242)');
    expect(await colorOf(page, '.kvc-conversation', 'backgroundColor')).toBe('rgb(247, 248, 250)');
    expect(await colorOf(page, '.kvc-conversation', 'color')).toBe('rgb(36, 42, 49)');
    expect(await colorOf(page, '[data-test="new-chat"]', 'backgroundColor')).toBe('rgb(53, 80, 122)');
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.waitForFunction("document.documentElement.classList.contains('dark')");
    expect(await colorOf(page, 'body', 'backgroundColor')).toBe('rgb(21, 21, 19)');
    await page.close();
  });
});
