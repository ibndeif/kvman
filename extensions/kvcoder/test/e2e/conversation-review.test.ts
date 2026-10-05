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

  it("QA25-H5 the panel never covers the header's menu, its header is one row at any width, a slash text on the Chat page creates no chat, and a sent upload leaves the kernel's files", async () => {
    world = await kvmanWorld();
    const kvman = await world.start();
    world.fake.reply(runs(command('artifact', 'write', { id: 'plan', title: 'The plan for the whole new website', content: '# The plan' })), says('Done.'), says('Read.'));
    const sessionId = sessionSchema.parse(await kvman.call('commands', 'kvcoder.session.create', { title: 'Review' })).id;
    await kvman.call('commands', 'kvcoder.message.send', { sessionId, text: 'Write the plan' });
    await until(() => kvman.call('queries', 'kvcoder.session.get', { sessionId }), sessionSchema, (found) => found.status === 'idle');
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(`${kvman.origin}/kvcoder/session/${sessionId}`);
    await page.locator('[data-test="artifacts-toggle"]').click();
    await page.locator('[data-test="artifact-panel"]').waitFor();
    for (const width of [1280, 800]) {
      await page.setViewportSize({ width, height: 800 });
      await page.locator('[data-test="chat-menu"]').click();
      await page.locator('[data-test="chat-menu-items"]').waitFor();
      await page.keyboard.press('Escape');
      const header = await rectOf(page, '.kvc-header');
      const panel = await rectOf(page, '[data-test="artifact-panel"]');
      expect(panel.y, String(width)).toBeGreaterThanOrEqual(header.bottom - 1);
      const name = await rectOf(page, '.kvc-artifact-name');
      const actions = await rectOf(page, '.kvc-artifact-actions');
      expect(actions.y, String(width)).toBeLessThan(name.bottom);
      expect(name.y, String(width)).toBeLessThan(actions.bottom);
      expect(name.width, String(width)).toBeGreaterThan(60);
      expect(actions.right, String(width)).toBeLessThanOrEqual(panel.right);
      expect(actions.x, String(width)).toBeGreaterThanOrEqual(panel.x);
    }

    const upload = await fetch(`${kvman.origin}/api/files?name=notes.md&workspaceId=home`, { method: 'POST', headers: { 'content-type': 'text/markdown' }, body: '# Notes' });
    const fileId = z.object({ file: z.object({ id: z.string() }) }).parse(await upload.json()).file.id;
    await kvman.call('commands', 'kvcoder.message.send', { sessionId, text: 'Read it', fileIds: [fileId] });
    await page.locator('[data-test="user-message"]', { hasText: '- attachments/notes.md' }).waitFor();
    await expect(kvman.call('queries', 'kernel.files.get', { id: fileId })).rejects.toThrow('NOT_FOUND');

    const before = z.array(z.unknown()).parse(await kvman.call('queries', 'kvcoder.session.list', { limit: 10 })).length;
    await page.goto(`${kvman.origin}/kvcoder/chat`);
    await page.locator('[data-test="composer-text"]').fill('/co');
    await page.locator('[data-test="slash-wait"]').waitFor();
    expect(await page.locator('.kvc-slash-row').getAttribute('aria-disabled')).toBe('true');
    await page.keyboard.press('Enter');
    expect(await page.locator('[data-test="composer-text"]').inputValue()).toBe('/co');
    expect(z.array(z.unknown()).parse(await kvman.call('queries', 'kvcoder.session.list', { limit: 10 })).length).toBe(before);
    await page.close();
  });
});
