import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { z } from '@kvman/sdk';
import { kvmanWorld, until, type KvmanWorld, type Running } from '../support/kvman-child.ts';
import { command, runs, says } from '../support/model-script.ts';

let browser: Browser;
let world: KvmanWorld | undefined;
let server: Server | undefined;

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser.close();
});

afterEach(async () => {
  await world?.close();
  world = undefined;
  await new Promise<void>((resolve) => (server === undefined ? resolve() : server.close(() => resolve())));
  server = undefined;
});

const sessionSchema = z.object({ id: z.string(), status: z.string() });

async function chatWithArtifact(input: Record<string, string>): Promise<{ kvman: Running; sessionId: string }> {
  world = await kvmanWorld();
  const kvman = await world.start();
  world.fake.reply(runs(command('artifact', 'write', input)), says('Done.'));
  const sessionId = sessionSchema.parse(await kvman.call('commands', 'kvcoder.session.create', { title: 'Artifact' })).id;
  await kvman.call('commands', 'kvcoder.message.send', { sessionId, text: 'Show it' });
  await until(() => kvman.call('queries', 'kvcoder.session.get', { sessionId }), sessionSchema, (found) => found.status === 'idle');
  return { kvman, sessionId };
}

async function openPanel(page: Page, kvman: Running, sessionId: string): Promise<void> {
  await page.goto(`${kvman.origin}/kvcoder/session/${sessionId}`);
  await page.locator('[data-test="artifact-open"]').first().click();
  await page.locator('[data-test="artifact-panel"]').waitFor();
}

const localPage = `<!doctype html><title>App</title><p id="msg">starting</p><script>
let reach = 'readable';
try { window.parent.document.title; } catch (error) { reach = 'blocked'; }
let storage = 'broken';
try { localStorage.setItem('seen', 'yes'); storage = localStorage.getItem('seen') === 'yes' ? 'works' : 'broken'; } catch (error) { storage = 'throws'; }
document.getElementById('msg').textContent = 'hello from the app: parent ' + reach + ', storage ' + storage;
</script>`;

describe('the artifact panel in Chromium (08 §8.7, ADR 0009, 214 and 216)', { timeout: 120_000 }, () => {
  it('QA12-H5 Copy puts the stored text on the real clipboard', async () => {
    const content = '<!DOCTYPE html><html><body><h1>Todo</h1></body></html>';
    const { kvman, sessionId } = await chatWithArtifact({ id: 'page', title: 'The page', format: 'html', content });
    const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await context.newPage();
    await openPanel(page, kvman, sessionId);
    await page.locator('[data-test="artifact-copy"]').click();
    await page.waitForFunction(`navigator.clipboard.readText().then((text) => text === ${JSON.stringify(content)})`);
    await page.locator('[data-test="artifact-view-source"]').click();
    expect(await page.locator('[data-test="artifact-source"]').textContent()).toBe(content);
    await context.close();
  });

  it('QA12-H7 a url artifact shows a page running on this machine with its own storage, in a frame that cannot read the parent', async () => {
    server = createServer((_request, response) => response.writeHead(200, { 'content-type': 'text/html' }).end(localPage));
    await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
    const { port } = z.object({ port: z.number() }).parse(server.address() as AddressInfo);
    const { kvman, sessionId } = await chatWithArtifact({ id: 'app', title: 'The app', format: 'url', content: `http://127.0.0.1:${String(port)}/` });
    const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
    await openPanel(page, kvman, sessionId);
    await page.locator('[data-test="artifact-url-frame"]').waitFor();
    await page.frameLocator('[data-test="artifact-url-frame"]').locator('#msg', { hasText: 'hello from the app: parent blocked, storage works' }).waitFor();
    expect(await page.locator('[data-test="artifact-open-url"]').getAttribute('href')).toBe(`http://127.0.0.1:${String(port)}/`);
    await page.close();
  });
});
