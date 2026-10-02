import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { z } from '@kvman/sdk';
import { childWait, kvmanWorld, until, type KvmanWorld } from '../support/kvman-child.ts';
import { artifactCommand, calls, says } from '../support/model-script.ts';

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

const scrollsSideways = (page: Page): Promise<boolean> => page.evaluate('document.documentElement.scrollWidth > window.innerWidth');

describe('the artifact panel in Chromium (08 §8.7, ADR 0009, 177 and 182)', { timeout: 120_000 }, () => {
  it('QA6-H21 the panel sits beside the conversation on a wide window and over it on a narrow one', async () => {
    world = await kvmanWorld();
    const kvman = await world.start();
    world.fake.reply(calls(artifactCommand('write', { id: 'plan', title: 'The plan', content: '# The plan' })), says('Done.'));
    const sessionId = sessionSchema.parse(await kvman.call('commands', 'kvcoder.session.create', { title: 'Artifact' })).id;
    await kvman.call('commands', 'kvcoder.message.send', { sessionId, text: 'Write the plan' });
    await until(() => kvman.call('queries', 'kvcoder.session.get', { sessionId }), sessionSchema, (found) => found.status === 'idle');
    const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
    await page.goto(`${kvman.origin}/kvcoder/session/${sessionId}`);
    await page.locator('[data-test="artifact-card"]').waitFor();
    expect(await page.locator('[data-test="artifact-panel"]').count()).toBe(0);
    await page.locator('[data-test="artifact-open"]').first().click();
    await page.locator('[data-test="artifact-panel"]').waitFor();
    const wideConversation = await rectOf(page, '[data-test="conversation"]');
    const widePanel = await rectOf(page, '[data-test="artifact-panel"]');
    expect(widePanel.x).toBeGreaterThanOrEqual(wideConversation.right - 1);
    expect(wideConversation.width).toBeGreaterThanOrEqual(480);
    expect(await scrollsSideways(page)).toBe(false);
    await page.setViewportSize({ width: 900, height: 800 });
    const narrowConversation = await rectOf(page, '[data-test="conversation"]');
    const narrowPanel = await rectOf(page, '[data-test="artifact-panel"]');
    expect(narrowPanel.x).toBeGreaterThanOrEqual(narrowConversation.x - 1);
    expect(narrowPanel.right).toBeLessThanOrEqual(narrowConversation.right + 1);
    expect(await scrollsSideways(page)).toBe(false);
    await page.locator('[data-test="artifact-close"]').click();
    await page.locator('[data-test="artifact-panel"]').waitFor({ state: 'detached', timeout: childWait.timeout });
    expect(await page.locator('[data-test="artifact-panel"]').count()).toBe(0);
    await page.close();
  });
});
