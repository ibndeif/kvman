import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { z } from '@kvman/sdk';
import type { FakeReply } from '@kvman/testkit/fake-openai';
import { kvmanWorld, type KvmanWorld } from '../support/kvman-child.ts';
import { command, fsCall, runs } from '../support/model-script.ts';

// At side-bar width, the running line's turn and seconds and a running helper's step and time stay on one line
// each (08 §8.7, QA83).

let browser: Browser;
let world: KvmanWorld | undefined;
let release: () => void = () => undefined;

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser.close();
});

afterEach(async () => {
  release();
  await world?.close();
  world = undefined;
});

const sessionSchema = z.object({ id: z.string(), status: z.string() });
const headline = 'Reading every module that converts uploaded documents to find where the converter identity is stored';

// A step that lists the folder; the lead and its helper each get one, in either order.
const working = (): FakeReply => runs(fsCall('list', { path: '.' }));
// A next step that thinks a long headline and holds until the test ends, so the lead and the helper stay running.
const holding = (held: Promise<void>): FakeReply => ({ chunks: [{ thinking: `**${headline}**` }, { wait: held }, { text: 'Done.' }] });

// How many lines the element's text takes in the page; a string, since it runs in Chromium.
const lineCount = async (page: Page, selector: string): Promise<number> => z.number().parse(await page.evaluate(`(() => {
  const range = document.createRange();
  range.selectNodeContents(document.querySelector('${selector}'));
  return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size;
})()`));

describe("a running helper's card in Chromium (08 §8.7, QA83)", { timeout: 120_000 }, () => {
  it('QA83-H1 beside a long headline, the running line and the helper card each keep their times on one line', async () => {
    world = await kvmanWorld();
    const kvman = await world.start();
    const held = new Promise<void>((resolve) => (release = resolve));
    world.fake.reply(runs(command('delegate', 'run', { worker: 'general', title: 'Converter expert', kind: 'find', goal: 'Find where the converter is stored', done: 'It is done.' })), working(), working(), holding(held), holding(held));
    const sessionId = sessionSchema.parse(await kvman.call('commands', 'kvcoder.session.create', { title: 'Replace the converter' })).id;
    await kvman.call('commands', 'kvcoder.message.send', { sessionId, text: 'Replace the converter' });
    const page = await browser.newPage({ viewport: { width: 300, height: 800 } });
    await page.goto(`${kvman.origin}/kvcoder/session/${sessionId}?embed=parent`);
    await page.locator('[data-test="subagent-headline"]').waitFor();
    await page.locator('[data-test="subagent-elapsed"]').waitFor();
    await page.locator('[data-test="activity-turn"]').waitFor();
    for (const part of ['activity-turn', 'activity-seconds', 'subagent-step', 'subagent-elapsed']) expect(await lineCount(page, `[data-test="${part}"]`), part).toBe(1);
    await page.close();
  });
});
