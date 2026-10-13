import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { z } from '@kvman/sdk';
import { kvmanWorld, until, type KvmanWorld } from '../support/kvman-child.ts';
import { command, runs, says } from '../support/model-script.ts';

let browser: Browser;
let world: KvmanWorld | undefined;
beforeAll(async () => { browser = await chromium.launch(); });
afterAll(async () => { await browser.close(); });
afterEach(async () => { await world?.close(); world = undefined; });

const sessionSchema = z.object({ id: z.string(), status: z.string() });
const step = (id: string, title: string, after: string[] = []) => ({ id, title, ...(after.length === 0 ? {} : { after }), check: `check ${id}` });
const steps = [step('read', 'Read the settings code'), step('store', 'Settings store', ['read']), step('page', 'Settings page', ['read']), step('test', 'End-to-end test', ['store', 'page'])];

describe('the execution map in Chromium (08 §8.7, ADR 0064)', { timeout: 120_000 }, () => {
  it('M2.4-E231 and E229 the header counts the steps, the panel draws a row per stage with no step over another, and the chat says what is left', async () => {
    world = await kvmanWorld();
    const kvman = await world.start();
    world.fake.reply(
      runs(command('execution-map', 'set', { goal: 'Ship the settings page', steps })),
      runs(command('execution-map', 'update', { steps: [{ id: 'read', status: 'done', evidence: 'Read src/settings.ts and its test.' }, { id: 'store', status: 'doing' }] })),
      says('Stopping here.'),
    );
    const sessionId = sessionSchema.parse(await kvman.call('commands', 'kvcoder.session.create', { title: 'Map' })).id;
    await kvman.call('commands', 'kvcoder.message.send', { sessionId, text: 'Plan it' });
    await until(() => kvman.call('queries', 'kvcoder.session.get', { sessionId }), sessionSchema, (session) => session.status === 'idle');
    const app = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    await app.goto(`${kvman.origin}/kvcoder/session/${sessionId}`);
    const toggle = app.locator('[data-test="map-toggle"]');
    await toggle.waitFor();
    expect(await toggle.textContent()).toBe('1/4');
    expect(await app.locator('[data-test="map-remaining"]').textContent()).toContain('3 steps of the execution map are not done.');
    expect(await app.locator('[data-test="execution-map"]').count()).toBe(0);
    await toggle.click();
    await app.locator('[data-test="map-step-test"]').waitFor();
    expect(await app.locator('[data-test="map-progress"]').textContent()).toBe('1 of 4 done');
    const boxes = new Map<string, { x: number; y: number; width: number; height: number }>();
    for (const { id } of steps) {
      const box = await app.locator(`[data-test="map-step-${id}"]`).boundingBox();
      if (box === null) throw new Error(`the step ${id} isn't drawn`);
      boxes.set(id, box);
    }
    const at = (id: string) => boxes.get(id) ?? { x: 0, y: 0, width: 0, height: 0 };
    expect(at('read').y).toBeLessThan(at('store').y);
    expect(at('store').y).toBe(at('page').y);
    expect(at('page').y).toBeLessThan(at('test').y);
    expect(Math.abs(at('store').x - at('page').x)).toBeGreaterThanOrEqual(at('store').width);
    expect(await app.locator('[data-test="map-edge"]').count()).toBe(4);
    expect(await app.locator('[data-test="map-step-store"]').getAttribute('data-status')).toBe('doing');
    await app.locator('[data-test="map-step-read"]').click();
    expect(await app.locator('[data-test="map-evidence"]').textContent()).toContain('Read src/settings.ts and its test.');
    const panel = await app.locator('[data-test="artifact-panel"]').boundingBox();
    const canvas = await app.locator('.kvc-map-canvas').boundingBox();
    // The diagram fits the panel, whatever its width is on this window.
    expect(panel !== null && canvas !== null && canvas.x >= panel.x && canvas.x + canvas.width <= panel.x + panel.width).toBe(true);
    await app.close();
  });
});
