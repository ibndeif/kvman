import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { z } from '@kvman/sdk';
import { kvmanWorld, until, type KvmanWorld, type Running } from '../support/kvman-child.ts';
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
const listSchema = z.object({ scrollWidth: z.number(), clientWidth: z.number(), listLeft: z.number(), listRight: z.number(), bubbleLeft: z.number(), bubbleRight: z.number() });
const headerSchema = z.object({ height: z.number(), titleTop: z.number(), statsTop: z.number(), titleBottom: z.number(), headerRight: z.number(), headerLeft: z.number(), widest: z.number(), conversation: z.number() });

// The page expression is a string: it runs in Chromium, where the DOM is, not in this Node process.
const headerExpression = `(() => {
  const box = (selector) => document.querySelector(selector).getBoundingClientRect();
  const header = box('.kvc-header');
  const title = box('[data-test="session-title"]');
  const stats = box('.kvc-header-stats');
  return { height: header.height, titleTop: title.top, statsTop: stats.top, titleBottom: title.bottom, headerRight: header.right, headerLeft: header.left, widest: Math.max(title.width, stats.width), conversation: box('.kvc-workspace').width };
})()`;

const listExpression = `(() => {
  const list = document.querySelector('.kvc-scroll');
  const box = list.getBoundingClientRect();
  const bubble = document.querySelector('[data-test="user-message"]').getBoundingClientRect();
  return { scrollWidth: list.scrollWidth, clientWidth: list.clientWidth, listLeft: box.left, listRight: box.right, bubbleLeft: bubble.left, bubbleRight: bubble.right };
})()`;

async function chat(text = 'Say it'): Promise<{ kvman: Running; sessionId: string }> {
  world = await kvmanWorld();
  const kvman = await world.start();
  world.fake.reply(says('The answer.'));
  const sessionId = sessionSchema.parse(await kvman.call('commands', 'kvcoder.session.create', { title: 'A chat with a title of a usual length' })).id;
  await kvman.call('commands', 'kvcoder.message.send', { sessionId, text });
  await until(() => kvman.call('queries', 'kvcoder.session.get', { sessionId }), sessionSchema, (session) => session.status === 'idle');
  return { kvman, sessionId };
}

async function header(kvman: Running, sessionId: string, width: number) {
  const page = await browser.newPage({ viewport: { width, height: 800 } });
  await page.goto(`${kvman.origin}/kvcoder/session/${sessionId}`);
  await page.locator('[data-test="session-context"]').waitFor();
  const measured = headerSchema.parse(await page.evaluate(headerExpression));
  await page.close();
  return measured;
}

describe("the chat's header and its message list's width in Chromium (08 §8.1 and §8.7, ADR 0035, 4 and 6)", { timeout: 120_000 }, () => {
  it('QA47-H5 in a wide window the header is one line, at most 48 px high', async () => {
    const { kvman, sessionId } = await chat();
    const wide = await header(kvman, sessionId, 1280);
    expect(wide.height).toBeLessThanOrEqual(48);
    expect(wide.statsTop).toBeLessThan(wide.titleBottom);
  });

  it('QA47-E3 in a narrow window the numbers wrap under the title and stay inside the conversation', async () => {
    const { kvman, sessionId } = await chat();
    const narrow = await header(kvman, sessionId, 420);
    expect(narrow.statsTop).toBeGreaterThanOrEqual(narrow.titleBottom);
    expect(narrow.widest).toBeLessThanOrEqual(narrow.conversation);
  });

  it("QA47-E4 a long word with no spaces doesn't make the message list scroll sideways", async () => {
    const { kvman, sessionId } = await chat(`See https://example.test/${'path'.repeat(75)} for the error`);
    const page = await browser.newPage({ viewport: { width: 700, height: 800 } });
    await page.goto(`${kvman.origin}/kvcoder/session/${sessionId}`);
    await page.locator('[data-test="user-message"]').waitFor();
    const list = listSchema.parse(await page.evaluate(listExpression));
    expect(list.scrollWidth).toBe(list.clientWidth);
    expect(list.bubbleLeft).toBeGreaterThanOrEqual(list.listLeft);
    expect(list.bubbleRight).toBeLessThanOrEqual(list.listRight);
    await page.close();
  });
});
