import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { z } from '@kvman/sdk';
import { kvmanWorld, until, type KvmanWorld } from '../support/kvman-child.ts';
import { says } from '../support/model-script.ts';

// The chat at three widths (08 §8.7, ADR 0093, 3): the send box never covers the messages, the chat list is a drawer
// below 60 rem, and the pickers are icons in a narrow conversation.

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
const layoutSchema = z.object({ workspace: z.number(), listBottom: z.number(), composerTop: z.number(), pageOverflow: z.number(), drawerButton: z.string(), sideList: z.string(), labels: z.array(z.string()) });

// Page expressions are strings: they run in Chromium.
const layout = `(() => {
  const main = document.querySelector('main');
  return {
    workspace: document.querySelector('.kvc-workspace').getBoundingClientRect().width,
    listBottom: document.querySelector('.kvc-scroll').getBoundingClientRect().bottom,
    composerTop: document.querySelector('.kvc-composer').getBoundingClientRect().top,
    pageOverflow: main.scrollHeight - main.clientHeight,
    drawerButton: getComputedStyle(document.querySelector('.kvc-chats-bar')).display,
    sideList: getComputedStyle(document.querySelector('nav.kvc-sessions')).display,
    labels: [...document.querySelectorAll('.kvc-composer-row .kvc-picker-label')].map((label) => getComputedStyle(label).display),
  };
})()`;

describe('the chat at narrow widths in Chromium (ADR 0093, 3)', { timeout: 120_000 }, () => {
  it('QA61-H7 and QA61-E7 the send box never covers the messages, the list is a drawer below 60 rem, and the pickers become icons', async () => {
    world = await kvmanWorld();
    const kvman = await world.start();
    world.fake.reply(says(Array.from({ length: 40 }, (_line, index) => `Line ${index + 1} of a long answer.`).join('\n\n')));
    const sessionId = sessionSchema.parse(await kvman.call('commands', 'kvcoder.session.create', { title: 'Narrow' })).id;
    await kvman.call('commands', 'kvcoder.message.send', { sessionId, text: 'Write a lot' });
    await until(() => kvman.call('queries', 'kvcoder.session.get', { sessionId }), sessionSchema, (found) => found.status === 'idle');
    for (const [width, narrow] of [[400, true], [768, true], [1440, false]] as const) {
      const page = await browser.newPage({ viewport: { width, height: 800 } });
      await page.goto(`${kvman.origin}/kvcoder/session/${sessionId}`);
      await page.locator('[data-test="assistant-message"]').waitFor();
      const shown = layoutSchema.parse(await page.evaluate(layout));
      expect(shown.listBottom, `${width}`).toBeLessThanOrEqual(shown.composerTop + 1);
      expect(shown.pageOverflow, `${width}`).toBeLessThanOrEqual(1);
      expect([shown.drawerButton, shown.sideList], `${width}`).toEqual(narrow ? ['flex', 'none'] : ['none', 'flex']);
      // The pickers are icons exactly when the conversation is narrower than 30 rem, as it is at 400 px.
      const icons = shown.workspace < 30 * 16;
      if (width === 400) expect(icons).toBe(true);
      expect(shown.labels.every((display) => display === (icons ? 'none' : 'block')), `${width}`).toBe(true);
      if (narrow) {
        await page.locator('[data-test="chats-open"]').click();
        await page.locator('[data-test="chats-drawer"] [data-test^="session-"]').first().waitFor();
        await page.keyboard.press('Escape');
        await page.locator('[data-test="chats-drawer"]').waitFor({ state: 'detached' });
      }
      await page.close();
    }
  });
});
