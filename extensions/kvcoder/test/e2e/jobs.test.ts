import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { z } from '@kvman/sdk';
import { kvmanWorld, until, type KvmanWorld } from '../support/kvman-child.ts';
import { runs, says, shell } from '../support/model-script.ts';

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
const processesSchema = z.array(z.object({ name: z.string() }));
const scrollsSideways = (page: Page): Promise<boolean> => page.evaluate('document.documentElement.scrollWidth > window.innerWidth');

describe("a chat's background jobs in Chromium (08 §8.7, ADR 0009, 149 to 153)", { timeout: 120_000 }, () => {
  it('QA3-H18 the Running chip lists a started server with its link and logs, and Stop ends it, on a narrow and a wide window', async () => {
    world = await kvmanWorld();
    const kvman = await world.start();
    world.fake.reply(runs(shell('echo "Serving on http://localhost:8123"; sleep 120', { background: true })), says('The server is running.'));
    const sessionId = sessionSchema.parse(await kvman.call('commands', 'kvcoder.session.create', { title: 'Server' })).id;
    await kvman.call('commands', 'kvcoder.message.send', { sessionId, text: 'serve the app' });
    await until(() => kvman.call('queries', 'kvcoder.session.get', { sessionId }), sessionSchema, (session) => session.status === 'idle');

    for (const viewport of [{ width: 390, height: 800 }, { width: 1280, height: 800 }]) {
      const page = await browser.newPage({ viewport });
      await page.goto(`${kvman.origin}/kvcoder/session/${sessionId}`);
      const chip = page.locator('[data-test="jobs-chip"]');
      await chip.waitFor();
      expect(await chip.textContent()).toContain('1 running');
      await chip.click();
      const popover = page.locator('[data-test="jobs-popover"]');
      await popover.waitFor();
      const box = await popover.boundingBox();
      expect(box === null ? 0 : box.x).toBeGreaterThanOrEqual(0);
      expect(box === null ? Infinity : box.x + box.width).toBeLessThanOrEqual(viewport.width);
      expect(await scrollsSideways(page)).toBe(false);
      await page.locator('[data-test="job-link"]').waitFor();
      expect(await page.locator('[data-test="job-link"]').getAttribute('href')).toBe('http://localhost:8123');
      await page.locator('[data-test^="job-logs-"]').click();
      await page.locator('[data-test="job-output"]', { hasText: 'Serving on http://localhost:8123' }).waitFor();
      if (viewport.width === 1280) {
        await page.locator('[data-test^="job-stop-"]').click();
        await page.locator('[data-test="job-status"]', { hasText: 'Stopped' }).waitFor();
        expect(processesSchema.parse(await kvman.call('queries', 'kernel.processes.list', {}))).toEqual([]);
      }
      await page.close();
    }
  });
});
