import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { z } from '@kvman/sdk';
import { kvmanWorld, type KvmanWorld } from '../support/kvman-child.ts';

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

const fixtureFile = fileURLToPath(new URL('../support/mcp-fixture.ts', import.meta.url));
const settingsSchema = z.array(z.object({ key: z.string(), value: z.json(), source: z.string() }));
const token = 'tok-e2e-91c2-SECRET';

describe('adding an MCP server in Chromium (08 §8.7, ADR 0020, 6, 9, 14, and 15)', { timeout: 120_000 }, () => {
  it('QA29-H16 the person adds a command server with a variable from the cog: it is ready, its value is only in secrets.json, and it is there after a reload', async () => {
    world = await kvmanWorld();
    const kvman = await world.start();
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`${kvman.origin}/kvwebui/extension/kvcoder`);
    const cog = page.locator('[data-test="connector-mcp"] [data-test="connector-configure"]');
    await cog.click();
    await page.locator('[data-test="mcp-empty"]').waitFor();
    await page.locator('[data-test="mcp-add"]').click();
    await page.locator('[data-test="mcp-name"]').fill('demo');
    await page.locator('[data-test="mcp-description"]').fill('A demo server.');
    await page.locator('[data-test="mcp-command"]').fill(process.execPath);
    await page.locator('[data-test="mcp-args"]').fill(fixtureFile);
    await page.locator('[data-test="mcp-value-add"]').click();
    await page.locator('[data-test="mcp-value-name"]').fill('TOKEN');
    await page.locator('[data-test="mcp-value-secret"]').fill(token);
    await page.locator('[data-test="mcp-save"]').click();

    const state = page.locator('[data-test="mcp-server-demo"] [data-test="mcp-server-state"]');
    await page.locator('[data-test="mcp-server-demo"] [data-test="mcp-server-state"][data-status="ready"]').waitFor();
    expect(await state.textContent()).toContain('Ready · 8 tools');
    const settings = settingsSchema.parse(await kvman.call('queries', 'kernel.settings.list', {}));
    expect(settings.find((setting) => setting.key === 'kvcoder.mcp.servers')).toMatchObject({ value: [{ name: 'demo', description: 'A demo server.', command: process.execPath, args: [fixtureFile], env: ['TOKEN'] }], source: 'global' });
    expect(JSON.stringify(settings)).not.toContain(token);
    expect(readFileSync(path.join(world.home, 'secrets.json'), 'utf8')).toContain(token);
    expect(await page.content()).not.toContain(token);

    await page.reload();
    await cog.click();
    await page.locator('[data-test="mcp-server-demo"] [data-test="mcp-server-state"][data-status="ready"]').waitFor();
    await page.locator('[data-test="mcp-server-edit"]').click();
    expect(await page.locator('[data-test="mcp-value-set"]').textContent()).toBe('Set');
    expect(await page.locator('[data-test="mcp-value-secret"]').count()).toBe(0);
    expect(await page.locator('[data-test="mcp-name"]').isDisabled()).toBe(true);
    await page.close();
  });
});
