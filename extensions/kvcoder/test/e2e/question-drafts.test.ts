import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { z } from '@kvman/sdk';
import { kvmanWorld, type KvmanWorld } from '../support/kvman-child.ts';
import { command, runs, says } from '../support/model-script.ts';

let browser: Browser;
let world: KvmanWorld | undefined;
const idSchema = z.object({ id: z.string() });
beforeAll(async () => { browser = await chromium.launch(); });
afterAll(async () => { await browser.close(); });
afterEach(async () => { await world?.close(); world = undefined; });

describe('KVC20 question draft acceptance in Chromium', { timeout: 120_000 }, () => {
  for (const kind of ['text', 'choice'] as const) {
    it(`M2.4-E134 ${kind} retains failed answers across SPA navigation and removes the card only after retry ACK`, async () => {
      world = await kvmanWorld();
      const kvman = await world.start();
      const payload = kind === 'text' ? { prompt: 'Your name?' } : { prompt: 'Which?', multiple: true, other: true, options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] };
      world.fake.reply(runs(command('ask', kind, payload)), says('Done.'));
      const sessionId = idSchema.parse(await kvman.call('commands', 'kvcoder.session.create', { title: 'Draft question' })).id;
      const away = idSchema.parse(await kvman.call('commands', 'kvcoder.session.create', { title: 'Away' })).id;
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      let requests = 0;
      let release: () => void = () => undefined;
      const gate = new Promise<void>(resolve => { release = resolve; });
      try {
        await page.route('**/api/commands/kvcoder.question.answer', async route => {
          requests += 1;
          if (requests === 1) { await route.abort('failed'); return; }
          await gate;
          await route.continue();
        });
        await page.goto(`${kvman.origin}/kvcoder/session/${sessionId}?workspace=home`);
        await page.locator('[data-test="composer-text"]').fill('Ask me');
        await page.locator('[data-test="send"]').click();
        await page.locator('[data-test="question-card"]').waitFor();
        if (kind === 'text') await page.locator('[data-test="answer-text"]').fill('Ada retained');
        else {
          await page.locator('[data-test="option-a"] input').check();
          await page.locator('[data-test="option-b"] input').check();
          await page.locator('[data-test="answer-other"]').fill('C retained');
        }
        await page.locator('[data-test="answer"]').click();
        await page.locator('[data-test="answer-error"]').waitFor();
        expect(requests).toBe(1);
        await page.evaluate("document.documentElement.dataset.draftNavigation = 'same-document'");
        await page.locator(`[data-test="session-${away}"]`).click();
        await page.locator('[data-test="session-title"]', { hasText: 'Away' }).waitFor();
        await page.locator(`[data-test="session-${sessionId}"]`).click();
        await page.locator('[data-test="question-card"]').waitFor();
        expect(await page.evaluate('document.documentElement.dataset.draftNavigation')).toBe('same-document');
        if (kind === 'text') expect(await page.locator('[data-test="answer-text"]').inputValue()).toBe('Ada retained');
        else {
          expect(await page.locator('[data-test="option-a"] input').isChecked()).toBe(true);
          expect(await page.locator('[data-test="option-b"] input').isChecked()).toBe(true);
          expect(await page.locator('[data-test="answer-other"]').inputValue()).toBe('C retained');
        }
        await page.locator('[data-test="answer"]').click();
        await page.locator('[data-test="answer-sending"]').waitFor();
        await expect.poll(() => requests).toBe(2);
        expect(await page.locator('[data-test="question-card"]').getAttribute('aria-busy')).toBe('true');
        expect(await page.locator('[data-test="answer"]').isDisabled()).toBe(true);
        expect(await page.locator(kind === 'text' ? '[data-test="answer-text"]' : '[data-test="answer-other"]').isDisabled()).toBe(true);
        await page.keyboard.press('Enter');
        expect(requests).toBe(2);
        release();
        await page.locator('[data-test="question-card"]').waitFor({ state: 'detached' });
        await page.locator('[data-test="answered-card"]').waitFor();
        await page.getByText('Done.', { exact: true }).waitFor();
        expect(await page.locator('[data-test="answered-card"]').textContent()).toContain(kind === 'text' ? 'Ada retained' : 'C retained');
        expect(requests).toBe(2);
        expect(errors).toEqual([]);
      } finally { release(); await page.close(); }
    });
  }
});
