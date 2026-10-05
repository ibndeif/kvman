import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { z } from '@kvman/sdk';
import { kvmanWorld, type KvmanWorld } from '../support/kvman-child.ts';

let browser: Browser;
let world: KvmanWorld | undefined;
const folders: string[] = [];

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser.close();
});

afterEach(async () => {
  await world?.close();
  world = undefined;
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

const idSchema = z.object({ id: z.string() });
const envelopeSchema = z.object({ ok: z.literal(true), output: z.unknown() });

// A call in one workspace, as the browser sends it.
async function callIn(origin: string, workspaceId: string, name: string, input: unknown): Promise<string> {
  const response = await fetch(`${origin}/api/commands/${name}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input, workspaceId }) });
  return idSchema.parse(envelopeSchema.parse(await response.json()).output).id;
}

describe('a workspace switch while a chat is open, in Chromium (08 §8.7, ADR 0016)', { timeout: 120_000 }, () => {
  it("QA23-H3 picking another workspace opens its newest chat, an empty one opens a new chat, and no error shows", async () => {
    world = await kvmanWorld();
    const kvman = await world.start();
    const root = mkdtempSync(path.join(tmpdir(), 'kvcoder-switch-'));
    folders.push(root);
    const [shop, empty] = ['shop', 'empty'].map((name) => path.join(root, name));
    for (const folder of [shop ?? '', empty ?? '']) mkdirSync(folder);
    const shopId = await callIn(kvman.origin, 'home', 'kernel.workspace.open', { path: shop });
    const emptyId = await callIn(kvman.origin, 'home', 'kernel.workspace.open', { path: empty });
    const homeChat = await callIn(kvman.origin, 'home', 'kvcoder.session.create', { title: 'Home chat' });
    await callIn(kvman.origin, shopId, 'kvcoder.session.create', { title: 'Older shop chat' });
    const shopChat = await callIn(kvman.origin, shopId, 'kvcoder.session.create', { title: 'Newest shop chat' });

    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    // Every call the page makes that the kernel answers with a Problem. The status bar's own read of the open chat
    // fails once at a switch, before the page has moved, so the calls are counted from each landing on.
    const failed: string[] = [];
    const settled = async (): Promise<string[]> => {
      failed.length = 0;
      // Two more reads of the chat list are at least one round of the conversation's own reads.
      for (let round = 0; round < 2; round += 1) await page.waitForResponse((response) => response.url().endsWith('/api/queries/kvcoder.session.list'));
      return [...failed];
    };
    page.on('response', (response) => {
      if (!response.url().includes('/api/queries/') && !response.url().includes('/api/commands/')) return;
      void response.json().then((answer: unknown) => {
        if (!envelopeSchema.safeParse(answer).success) failed.push(new URL(response.url()).pathname);
      });
    });
    await page.goto(`${kvman.origin}/kvcoder/session/${homeChat}?workspace=home`);
    await page.locator('[data-test="session-title"]', { hasText: 'Home chat' }).waitFor();

    await page.locator('button:has([data-test="workspace-current"])').click();
    await page.locator(`[data-test="workspace-${shopId}"]`).click();
    await page.locator('[data-test="session-title"]', { hasText: 'Newest shop chat' }).waitFor();
    expect(new URL(page.url()).pathname).toBe(`/kvcoder/session/${shopChat}`);
    expect(await page.locator(`[data-test="session-${shopChat}"]`).getAttribute('aria-current')).toBe('page');
    expect(await settled()).toEqual([]);
    expect(await page.locator('[data-test="status-kvcoder.chat"].text-danger').count()).toBe(0);

    await page.locator('button:has([data-test="workspace-current"])').click();
    await page.locator(`[data-test="workspace-${emptyId}"]`).click();
    await page.locator('[data-test="chat-start"]').waitFor();
    expect(new URL(page.url()).pathname).toBe('/kvcoder/chat');
    expect(await page.locator('[data-test="session-title"]').count()).toBe(0);
    expect(await settled()).toEqual([]);
    expect(await page.locator('[role="status"][data-level="error"]').count()).toBe(0);
    await page.close();
  });
});
