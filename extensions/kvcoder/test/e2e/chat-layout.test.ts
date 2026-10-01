import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
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

// A chat that has one answer, so the page shows the conversation and the session list.
async function chatWithAnswer(title: string): Promise<{ kvman: Running; sessionId: string }> {
  world = await kvmanWorld();
  const kvman = await world.start();
  world.fake.reply(says('Here is the answer.'));
  const sessionId = sessionSchema.parse(await kvman.call('commands', 'kvcoder.session.create', { title })).id;
  await kvman.call('commands', 'kvcoder.message.send', { sessionId, text: 'Say something' });
  await until(() => kvman.call('queries', 'kvcoder.session.get', { sessionId }), sessionSchema, (session) => session.status === 'idle');
  return { kvman, sessionId };
}

const rectOf = (page: Page, selector: string) => page.locator(selector).first().evaluate((element) => {
  const { x, y, width, height } = element.getBoundingClientRect();
  return { x, y, width, height, right: x + width, bottom: y + height };
});

const scrollsSideways = (page: Page): Promise<boolean> => page.evaluate('document.documentElement.scrollWidth > window.innerWidth');

describe('the chat page in Chromium (08 §8.7, ADR 0009, 130–137)', { timeout: 120_000 }, () => {
  it('QA1-H1 the conversation sits beside the session list and fills the window', async () => {
    const { kvman, sessionId } = await chatWithAnswer('Layout');
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(`${kvman.origin}/kvcoder/session/${sessionId}`);
    await page.locator('[data-test="assistant-message"]').waitFor();
    const sessions = await rectOf(page, '[data-test="sessions"]');
    const conversation = await rectOf(page, '[data-test="conversation"]');
    const composer = await rectOf(page, '[data-test="composer-text"]');
    const statusBar = await rectOf(page, '[data-test="status-bar"]');
    expect(sessions.right).toBeLessThanOrEqual(conversation.x + 1);
    expect(Math.abs(sessions.y - conversation.y)).toBeLessThan(2);
    expect(composer.bottom).toBeLessThanOrEqual(statusBar.y);
    expect(conversation.bottom).toBeLessThanOrEqual(statusBar.y);
    expect(await page.evaluate('document.querySelector("main").scrollHeight <= document.querySelector("main").clientHeight')).toBe(true);
    await page.close();
  });

  it('QA1-E1 below 30 rem of conversation the chat stacks, without scrolling sideways', async () => {
    const { kvman, sessionId } = await chatWithAnswer('Stacked');
    const page = await browser.newPage({ viewport: { width: 600, height: 800 } });
    await page.goto(`${kvman.origin}/kvcoder/session/${sessionId}`);
    await page.locator('[data-test="assistant-message"]').waitFor();
    const sessions = await rectOf(page, '[data-test="sessions"]');
    const conversation = await rectOf(page, '[data-test="conversation"]');
    expect(conversation.y).toBeGreaterThanOrEqual(sessions.bottom - 1);
    expect(await scrollsSideways(page)).toBe(false);
    await page.close();
  });

  it('QA1-E4 a long title leaves the time on one line', async () => {
    const { kvman, sessionId } = await chatWithAnswer('A very long conversation title that has to be cut short in the list');
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(`${kvman.origin}/kvcoder/session/${sessionId}`);
    const time = await rectOf(page, `[data-test="session-${sessionId}"] .kvc-muted`);
    expect(time.height).toBeLessThan(30);
    await page.close();
  });

  it('QA1-H2 the waiting count follows the steps with no reload', async () => {
    world = await kvmanWorld();
    const kvman = await world.start();
    let release = (): void => undefined;
    const begin = new Promise<void>((resolve) => (release = resolve));
    const question = { id: 'ask-1', name: 'bash', arguments: { description: 'Ask.', command: `ask confirm '{"prompt":"Go on?"}'` } };
    world.fake.reply({ chunks: [{ wait: begin }, { toolCall: question }] }, says('Done.'));
    const sessionId = sessionSchema.parse(await kvman.call('commands', 'kvcoder.session.create', { title: 'Waiting' })).id;
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(`${kvman.origin}/kvcoder/session/${sessionId}`);
    await page.locator('[data-test="conversation"]').waitFor();
    const counted = (count: number) => page.waitForFunction(`document.querySelector('[data-test="status-bar"]')?.textContent?.includes(${JSON.stringify(`Waiting for you: ${String(count)}`)}) === true`, undefined, { timeout: 10_000 });
    // The step's stream must be attached before the step ends, or the page has no job to follow (ADR 0009, 131).
    const streamed = page.waitForRequest((request) => /\/api\/jobs\/[^/]+\/stream$/.test(new URL(request.url()).pathname));
    await page.locator('[data-test="composer-text"]').fill('Run it');
    await page.locator('[data-test="send"]').click();
    await streamed;
    release();
    await page.locator('[data-test="question-card"]').waitFor();
    await counted(1);
    await page.locator('[data-test="answer-yes"]').click();
    await counted(0);
    await page.close();
  });
});
