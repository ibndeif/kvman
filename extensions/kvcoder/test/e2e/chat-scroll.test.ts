import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { z } from '@kvman/sdk';
import { kvmanWorld, until, type KvmanWorld, type Running } from '../support/kvman-child.ts';
import { runs, says, shell } from '../support/model-script.ts';
import type { FakeReply } from '@kvman/testkit/fake-openai';

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
const colorsSchema = z.object({ background: z.string(), text: z.string() });
const listSchema = z.object({ scrollable: z.boolean(), overflow: z.string() });
const edgeSchema = z.object({ left: z.number(), right: z.number() });
const edgesSchema = z.object({ description: edgeSchema, label: edgeSchema });
const fitSchema = z.object({ buttonLeft: z.number(), buttonRight: z.number(), popoverLeft: z.number(), popoverRight: z.number(), conversationLeft: z.number(), conversationRight: z.number(), sideways: z.object({ document: z.boolean(), main: z.boolean(), conversation: z.boolean() }) });
const upwardSchema = z.object({ popoverBottom: z.number(), buttonTop: z.number(), sideways: z.boolean() });

// Page expressions are strings: they run in Chromium, where the DOM is, not in this Node process.
const edgesExpression = `(() => {
  const edge = (selector) => {
    const range = document.createRange();
    range.selectNodeContents(document.querySelector(selector));
    const { left, right } = range.getBoundingClientRect();
    return { left, right };
  };
  return { description: edge('[data-test="call-description"]'), label: edge('[data-test="call-summary"]') };
})()`;
// The popover re-fits on the frame after the conversation changes size, so a test waits for it to lie inside (ADR 0009, 221).
const insideExpression = `(() => {
  const popover = document.querySelector('[data-test="model-popover"]').getBoundingClientRect();
  const box = document.querySelector('.kvc-conversation').getBoundingClientRect();
  return popover.left >= box.left - 1 && popover.right <= box.right + 1;
})()`;
// Waits for the popover to lie inside the conversation; a failure says where everything was, and for which window.
async function insideConversation(page: Page, context: string): Promise<void> {
  await page.waitForFunction(insideExpression, undefined, { timeout: 10_000 }).catch(async (error: unknown) => {
    throw new Error(`${context}: ${JSON.stringify(await page.evaluate(fitExpression))}`, { cause: error });
  });
}

const fitExpression = `(() => {
  const popover = document.querySelector('[data-test="model-popover"]').getBoundingClientRect();
  const conversation = document.querySelector('.kvc-conversation');
  const box = conversation.getBoundingClientRect();
  const main = document.querySelector('main');
  const button = document.querySelector('.kvc-composer [data-test="model-picker"]').getBoundingClientRect();
  return {
    buttonLeft: button.left,
    buttonRight: button.right,
    popoverLeft: popover.left,
    popoverRight: popover.right,
    conversationLeft: box.left,
    conversationRight: box.right,
    sideways: { document: document.documentElement.scrollWidth > innerWidth, main: main.scrollWidth > main.clientWidth, conversation: conversation.scrollWidth > conversation.clientWidth },
  };
})()`;
const idle = (session: { status: string }): boolean => session.status === 'idle';

const paragraphs = (count: number): string => Array.from({ length: count }, (_, index) => `Paragraph ${String(index + 1)} of a long answer.`).join('\n\n');

// A chat that has run one turn per reply, so the page shows a long conversation.
async function chatWith(...replies: FakeReply[]): Promise<{ kvman: Running; sessionId: string }> {
  world = await kvmanWorld();
  const kvman = await world.start();
  world.fake.reply(...replies);
  const sessionId = sessionSchema.parse(await kvman.call('commands', 'kvcoder.session.create', { title: 'Long' })).id;
  await kvman.call('commands', 'kvcoder.message.send', { sessionId, text: 'Say it' });
  await until(() => kvman.call('queries', 'kvcoder.session.get', { sessionId }), sessionSchema, idle);
  return { kvman, sessionId };
}

const openChat = async (kvman: Running, sessionId: string, viewport = { width: 1280, height: 800 }): Promise<Page> => {
  const page = await browser.newPage({ viewport });
  await page.goto(`${kvman.origin}/kvcoder/session/${sessionId}`);
  await page.locator('[data-test="user-message"]').first().waitFor();
  return page;
};

const atEnd = (page: Page) => page.waitForFunction("(() => { const list = document.querySelector('.kvc-scroll'); return list !== null && list.scrollHeight > list.clientHeight && list.scrollHeight - list.clientHeight - list.scrollTop < 2; })()");

const scrollToTop = (page: Page) => page.locator('.kvc-scroll').evaluate((list) => void (list.scrollTop = 0));

const rectOf = (page: Page, selector: string) => page.locator(selector).first().evaluate((element) => {
  const { x, y, width, height } = element.getBoundingClientRect();
  return { x, y, width, height, right: x + width, bottom: y + height };
});

const send = async (page: Page, text: string): Promise<void> => {
  await page.locator('[data-test="composer-text"]').fill(text);
  await page.locator('[data-test="send"]').click();
};

const luminance = (color: string): number => {
  const [red = 0, green = 0, blue = 0] = (/\d+/gu.exec(color) === null ? [] : color.match(/\d+/gu) ?? []).map(Number);
  return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
};

describe('a long chat in Chromium (08 §8.7, ADR 0009, 195–199)', { timeout: 120_000 }, () => {
  it('QA9-H14 and QA9-H15 a long chat scrolls inside its column, opens at its last message, and keeps its header and send box in view', async () => {
    const { kvman, sessionId } = await chatWith(says(paragraphs(80)));
    const page = await openChat(kvman, sessionId);
    await atEnd(page);
    expect(await page.evaluate('document.querySelector("main").scrollHeight <= document.querySelector("main").clientHeight')).toBe(true);
    const header = await rectOf(page, '.kvc-header');
    const composer = await rectOf(page, '[data-test="composer-text"]');
    const statusBar = await rectOf(page, '[data-test="status-bar"]');
    expect(header.y).toBeGreaterThanOrEqual(0);
    expect(composer.bottom).toBeLessThanOrEqual(statusBar.y);
    expect(composer.bottom).toBeLessThanOrEqual(800);
    await page.close();
  });

  it('QA9-H16 and QA9-H17 the view follows new messages at the end, stops when scrolled up, and the button and sending bring it back', async () => {
    const { kvman, sessionId } = await chatWith(says(paragraphs(60)), says(paragraphs(60)), says(paragraphs(60)));
    const page = await openChat(kvman, sessionId);
    await atEnd(page);
    await send(page, 'More');
    await page.locator('[data-test="user-message"]', { hasText: 'More' }).waitFor();
    await page.locator('[data-test="assistant-message"]').nth(1).waitFor();
    await atEnd(page);
    expect(await page.locator('[data-test="jump-to-latest"]').count()).toBe(0);

    await scrollToTop(page);
    await page.locator('[data-test="jump-to-latest"]').waitFor();
    await page.locator('[data-test="jump-to-latest"]').click();
    await atEnd(page);
    await page.locator('[data-test="jump-to-latest"]').waitFor({ state: 'detached' });

    await scrollToTop(page);
    await page.locator('[data-test="jump-to-latest"]').waitFor();
    await send(page, 'Again');
    await page.locator('[data-test="assistant-message"]').nth(2).waitFor();
    await atEnd(page);
    await page.close();
  });

  it('QA9-H12 a card opened in either theme shows its command and output on dark blocks', async () => {
    const { kvman, sessionId } = await chatWith(runs(shell('echo hello')), says('Done.'));
    const page = await openChat(kvman, sessionId);
    await page.locator('[data-test="call-card"] button').click();
    for (const scheme of ['dark', 'light'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      for (const block of ['call-payload', 'call-output']) {
        const colors = colorsSchema.parse(await page.evaluate(`(() => { const style = getComputedStyle(document.querySelector('[data-test="${block}"]')); return { background: style.backgroundColor, text: style.color }; })()`));
        expect(luminance(colors.background), `${scheme} ${block} background`).toBeLessThan(0.2);
        expect(luminance(colors.text), `${scheme} ${block} text`).toBeGreaterThan(0.6);
      }
    }
    await page.close();
  });

  it('QA9-E12 the session list scrolls on its own, and the page does not', async () => {
    const { kvman, sessionId } = await chatWith(says('Hi.'));
    for (let index = 0; index < 60; index += 1) await kvman.call('commands', 'kvcoder.session.create', { title: `Chat ${String(index)}` });
    const page = await openChat(kvman, sessionId);
    await page.locator('[data-test="sessions"]').waitFor();
    const list = listSchema.parse(await page.evaluate("(() => { const element = document.querySelector('[data-test=\"sessions\"]'); return { scrollable: element.scrollHeight > element.clientHeight, overflow: getComputedStyle(element).overflowY }; })()"));
    expect(list).toEqual({ scrollable: true, overflow: 'auto' });
    expect(await page.evaluate('document.querySelector("main").scrollHeight <= document.querySelector("main").clientHeight')).toBe(true);
    await page.close();
  });

  it('QA9-H19 and QA24-E10 a new chat has the question in the middle and the send box, with its pickers, at the bottom', async () => {
    world = await kvmanWorld();
    const kvman = await world.start();
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(kvman.origin);
    await page.locator('.kvc-composer [data-test="model-picker"]').waitFor();
    const question = await rectOf(page, '.kvc-start h1');
    const composer = await rectOf(page, '[data-test="composer-text"]');
    const statusBar = await rectOf(page, '[data-test="status-bar"]');
    expect(question.bottom).toBeLessThanOrEqual(composer.y);
    expect(composer.bottom).toBeLessThanOrEqual(statusBar.y);
    expect(await page.locator('.kvc-composer [data-test="thinking-picker"]').count()).toBe(1);
    expect(await page.locator('header.kvc-header').count()).toBe(0);
    await page.close();
  });

  it('QA9-E14 the Chat page in Arabic fits a narrow window, with the send box, its picker, and the send button in view', async () => {
    world = await kvmanWorld();
    const kvman = await world.start();
    await kvman.call('commands', 'kernel.settings.set', { key: 'kernel.language', value: 'ar', scope: 'global' });
    const page = await browser.newPage({ viewport: { width: 600, height: 800 } });
    await page.goto(kvman.origin);
    await page.locator('.kvc-composer [data-test="model-picker"]').waitFor();
    for (const selector of ['.kvc-box', '[data-test="model-picker"]', '[data-test="thinking-picker"]', '[data-test="send"]']) {
      const box = await rectOf(page, selector);
      expect(box.x, selector).toBeGreaterThanOrEqual(0);
      expect(box.right, selector).toBeLessThanOrEqual(600);
    }
    expect(await page.evaluate('document.documentElement.scrollWidth > window.innerWidth')).toBe(false);
    await page.close();
  });

  it('QA10-H10 a card\'s description and its connector command share one edge: the right in Arabic, the left in English', async () => {
    const { kvman, sessionId } = await chatWith(runs(shell('echo hello')), says('Done.'));
    for (const language of ['ar', 'en'] as const) {
      await kvman.call('commands', 'kernel.settings.set', { key: 'kernel.language', value: language, scope: 'global' });
      const page = await openChat(kvman, sessionId);
      await page.locator('[data-test="call-card"]').waitFor();
      const edges = edgesSchema.parse(await page.evaluate(edgesExpression));
      const side = language === 'ar' ? 'right' : 'left';
      expect(Math.abs(edges.description[side] - edges.label[side]), `${language} description and label`).toBeLessThan(1.5);
      await page.close();
    }
  });

  it('QA10-H11 the model popover stays inside the conversation at any width, and never scrolls the page sideways', async () => {
    const { kvman, sessionId } = await chatWith(says('Hi.'));
    for (const language of ['en', 'ar'] as const) {
      await kvman.call('commands', 'kernel.settings.set', { key: 'kernel.language', value: language, scope: 'global' });
      for (const width of [1280, 800, 600, 400]) {
        const page = await openChat(kvman, sessionId, { width, height: 800 });
        await page.locator('.kvc-composer [data-test="model-picker"]').click();
        await page.locator('[data-test="model-popover"]').waitFor();
        await insideConversation(page, `${language} ${String(width)}`);
        const found = fitSchema.parse(await page.evaluate(fitExpression));
        expect(found.popoverLeft, `${language} ${String(width)} popover start`).toBeGreaterThanOrEqual(found.conversationLeft - 1);
        expect(found.popoverRight, `${language} ${String(width)} popover end`).toBeLessThanOrEqual(found.conversationRight + 1);
        expect(found.sideways, `${language} ${String(width)} sideways scroll`).toEqual({ document: false, main: false, conversation: false });
        await page.close();
      }
    }
  });

  it('QA10-H15 the model popover opens at its button, at any width, in either language', async () => {
    const { kvman, sessionId } = await chatWith(says('Hi.'));
    for (const language of ['en', 'ar'] as const) {
      await kvman.call('commands', 'kernel.settings.set', { key: 'kernel.language', value: language, scope: 'global' });
      for (const width of [1280, 800, 600, 400]) {
        const page = await openChat(kvman, sessionId, { width, height: 800 });
        await page.locator('.kvc-composer [data-test="model-picker"]').click();
        await page.locator('[data-test="model-popover"]').waitFor();
        await insideConversation(page, `${language} ${String(width)}`);
        const found = fitSchema.parse(await page.evaluate(fitExpression));
        expect(found.popoverLeft, `${language} ${String(width)} button start`).toBeLessThanOrEqual(found.buttonLeft + 1);
        expect(found.popoverRight, `${language} ${String(width)} button end`).toBeGreaterThanOrEqual(found.buttonRight - 1);
        await page.close();
      }
    }
  });

  it('QA10-E11 an open model popover fits again when the window is resized', async () => {
    const { kvman, sessionId } = await chatWith(says('Hi.'));
    const page = await openChat(kvman, sessionId);
    await page.locator('.kvc-composer [data-test="model-picker"]').click();
    await page.locator('[data-test="model-popover"]').waitFor();
    for (const width of [700, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      await insideConversation(page, `resized to ${String(width)}`);
      const found = fitSchema.parse(await page.evaluate(fitExpression));
      expect(found.sideways, `${String(width)} sideways scroll`).toEqual({ document: false, main: false, conversation: false });
    }
    await page.close();
  });

  it('QA10-E8 the recovery picker opens upward from its button and stays inside the column', async () => {
    world = await kvmanWorld();
    const kvman = await world.start();
    world.fake.reply({ status: 400, body: { error: { message: 'Bad request', type: 'invalid_request_error' } } });
    const sessionId = sessionSchema.parse(await kvman.call('commands', 'kvcoder.session.create', { title: 'Failing' })).id;
    await kvman.call('commands', 'kvcoder.message.send', { sessionId, text: 'Go' });
    await until(() => kvman.call('queries', 'kvcoder.session.get', { sessionId }), sessionSchema, idle);
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(`${kvman.origin}/kvcoder/session/${sessionId}`);
    await page.locator('[data-test="recovery"] [data-test="model-picker"]').click();
    await page.locator('[data-test="recovery"] [data-test="model-popover"]').waitFor();
    const found = upwardSchema.parse(await page.evaluate("(() => { const button = document.querySelector('[data-test=\"recovery\"] [data-test=\"model-picker\"]').getBoundingClientRect(); const popover = document.querySelector('[data-test=\"recovery\"] [data-test=\"model-popover\"]').getBoundingClientRect(); const main = document.querySelector('main'); return { popoverBottom: popover.bottom, buttonTop: button.top, sideways: main.scrollWidth > main.clientWidth }; })()"));
    expect(found.popoverBottom).toBeLessThanOrEqual(found.buttonTop);
    expect(found.sideways).toBe(false);
    await page.close();
  });
});

