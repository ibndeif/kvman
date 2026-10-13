import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { z } from '@kvman/sdk';
import { kvmanWorld, until, type KvmanWorld, type Running } from '../support/kvman-child.ts';
import { command, runs, says } from '../support/model-script.ts';

let browser: Browser;
let world: KvmanWorld | undefined;
beforeAll(async () => { browser = await chromium.launch(); });
afterAll(async () => { await browser.close(); });
afterEach(async () => { await world?.close(); world = undefined; });

const sessionSchema = z.object({ id: z.string(), status: z.string() });
const steps = [
  { id: 'read', title: 'Read the settings code', description: 'Read it.', check: 'check read' },
  ...['store', 'page', 'form', 'help'].map((id) => ({ id, title: `Settings ${id}`, description: `Change ${id}.`, after: ['read'], check: `check ${id}` })),
];

const widthOf = async (page: Page, selector: string): Promise<number> => {
  const box = await page.locator(selector).first().boundingBox();
  if (box === null) throw new Error(`${selector} isn't shown`);
  return box.width;
};

async function chat(kvman: Running, title: string): Promise<string> {
  const sessionId = sessionSchema.parse(await kvman.call('commands', 'kvcoder.session.create', { title })).id;
  await kvman.call('commands', 'kvcoder.message.send', { sessionId, text: 'Plan it' });
  await until(() => kvman.call('queries', 'kvcoder.session.get', { sessionId }), sessionSchema, (found) => found.status === 'idle');
  return sessionId;
}

describe("the panel's width in Chromium (08 §8.7, ADR 0071, 4)", { timeout: 120_000 }, () => {
  it('QA50-H8 dragging the handle sets the width, the map is fitted to it, and the browser keeps it for every chat', async () => {
    world = await kvmanWorld();
    const kvman = await world.start();
    world.fake.reply(runs(command('execution-map', 'set', { goal: 'Ship the settings page', steps }), command('artifact', 'write', { id: 'plan', title: 'The plan', content: '# The plan' })), says('Done.'));
    const first = await chat(kvman, 'Map');
    world.fake.reply(runs(command('artifact', 'write', { id: 'notes', title: 'Notes', content: '# Notes' })), says('Done.'));
    const second = await chat(kvman, 'Notes');
    const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    await page.goto(`${kvman.origin}/kvcoder/session/${first}`);
    await page.locator('[data-test="map-toggle"]').click();
    await page.locator('[data-test="map-step-help"]').waitFor();
    const stepBefore = await widthOf(page, '[data-test="map-step-store"]');
    const panel = await page.locator('[data-test="artifact-panel"]').boundingBox();
    const handle = await page.locator('[data-test="panel-resizer"]').boundingBox();
    if (panel === null || handle === null) throw new Error("the panel or its handle isn't shown");
    await page.mouse.move(handle.x + handle.width / 2, handle.y + 200);
    await page.mouse.down();
    await page.mouse.move(panel.x + panel.width - 600, handle.y + 220, { steps: 5 });
    await page.mouse.up();
    expect(Math.abs((await widthOf(page, '[data-test="artifact-panel"]')) - 600)).toBeLessThanOrEqual(1);
    expect(await page.evaluate("localStorage.getItem('kvcoder.panelWidth')")).toBe('600');
    await page.waitForFunction(`document.querySelector('[data-test="map-step-store"]').getBoundingClientRect().width > ${stepBefore}`);
    expect(await page.evaluate('document.documentElement.scrollWidth > window.innerWidth')).toBe(false);

    await page.goto(`${kvman.origin}/kvcoder/session/${second}`);
    await page.locator('[data-test="artifact-open"]').first().click();
    expect(Math.abs((await widthOf(page, '[data-test="artifact-panel"]')) - 600)).toBeLessThanOrEqual(1);

    await page.evaluate("localStorage.setItem('kvcoder.panelWidth', '5000')");
    await page.reload();
    await page.locator('[data-test="artifact-open"]').first().click();
    const stage = await widthOf(page, '.kvc-stage');
    expect(Math.abs((await widthOf(page, '[data-test="artifact-panel"]')) - stage * 0.7)).toBeLessThanOrEqual(1);
    await page.close();
  });

  it('QA50-E7 where the panel lies over the conversation there is no handle, and the kept width is not used', async () => {
    world = await kvmanWorld();
    const kvman = await world.start();
    world.fake.reply(runs(command('artifact', 'write', { id: 'plan', title: 'The plan', content: '# The plan' })), says('Done.'));
    const sessionId = await chat(kvman, 'Artifact');
    const page = await browser.newPage({ viewport: { width: 900, height: 800 } });
    await page.goto(`${kvman.origin}/kvcoder/session/${sessionId}`);
    await page.evaluate("localStorage.setItem('kvcoder.panelWidth', '600')");
    await page.reload();
    await page.locator('[data-test="artifact-open"]').first().click();
    await page.locator('[data-test="artifact-panel"]').waitFor();
    const stage = await widthOf(page, '.kvc-stage');
    expect(stage).toBeLessThan(48 * 16);
    expect(await page.locator('[data-test="panel-resizer"]').isVisible()).toBe(false);
    expect(Math.abs((await widthOf(page, '[data-test="artifact-panel"]')) - Math.min(stage, 32 * 16))).toBeLessThanOrEqual(1);
    await page.close();
  });
});
