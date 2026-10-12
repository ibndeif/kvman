import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { z } from '@kvman/sdk';
import { kvmanWorld, type KvmanWorld } from '../support/kvman-child.ts';
import { command, runs } from '../support/model-script.ts';

let browser: Browser;
let world: KvmanWorld | undefined;
const idSchema = z.object({ id: z.string() });
beforeAll(async () => { browser = await chromium.launch(); });
afterAll(async () => { await browser.close(); });
afterEach(async () => { await world?.close(); world = undefined; });

async function size(page: Page, selector: string): Promise<{ width: number; height: number }> {
  const box = await page.locator(selector).first().boundingBox();
  if (box === null) throw new Error(`${selector} isn't shown`);
  return { width: Math.round(box.width), height: Math.round(box.height) };
}

// A chat waiting on a question, so Stop shows, with one file attached.
async function waitingChat(touch: boolean): Promise<Page> {
  world = await kvmanWorld();
  const kvman = await world.start();
  world.fake.reply(runs(command('ask', 'text', { prompt: 'Name?' })));
  const sessionId = idSchema.parse(await kvman.call('commands', 'kvcoder.session.create', { title: 'Touch' })).id;
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, hasTouch: touch, isMobile: touch });
  const page = await context.newPage();
  await page.goto(`${kvman.origin}/kvcoder/session/${sessionId}?workspace=home`);
  await page.locator('[data-test="composer-text"]').fill('Ask me');
  await page.locator('[data-test="send"]').click();
  await page.locator('[data-test="question-card"]').waitFor();
  await page.locator('[data-test="composer-files"]').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('x') });
  await page.locator('[data-test="attachment"]').waitFor();
  return page;
}

describe('touch targets and keyboard focus (KVC-26)', { timeout: 120_000 }, () => {
  it('M2.4-E189 under a finger every control is at least 44 px', async () => {
    const page = await waitingChat(true);
    expect(await page.evaluate("matchMedia('(pointer: coarse)').matches")).toBe(true);
    for (const selector of ['[data-test="send"]', '[data-test="stop"]', '.kvc-composer-row .kvc-button', '.kvc-session']) expect((await size(page, selector)).height, selector).toBeGreaterThanOrEqual(44);
    const remove = await size(page, '[data-test="attachment"] button');
    expect(Math.min(remove.width, remove.height)).toBeGreaterThanOrEqual(44);
    await page.context().close();
  });

  it('M2.4-E189 with a mouse the sizes are as before, and keyboard focus shows an outline', async () => {
    const page = await waitingChat(false);
    expect((await size(page, '[data-test="send"]')).height).toBe(36);
    expect((await size(page, '[data-test="attachment"] button')).height).toBeLessThan(44);
    await page.locator('[data-test="composer-text"]').focus();
    expect(await page.evaluate("getComputedStyle(document.querySelector('.kvc-box')).outlineStyle")).toBe('solid');
    await page.keyboard.press('Tab');
    expect(await page.evaluate("getComputedStyle(document.activeElement).outlineStyle")).toBe('solid');
    await page.context().close();
  });
});
