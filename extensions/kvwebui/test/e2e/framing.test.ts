import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type ConsoleMessage } from 'playwright';
import { startKvman, type RunningKvman } from './support/kvman.ts';

let browser: Browser;
let kvman: RunningKvman;
let localPage: Server;

const framing = (origin: string) => `<!doctype html><title>frames kvman</title><iframe name="kvman" src="${origin}/" width="800" height="600"></iframe>`;

// Chromium's own Local Network Access check would refuse a public page's frame of 127.0.0.1 before kvman's policy is
// read; it is off here so that the test sees the policy, which also guards browsers that have no such check.
beforeAll(async () => {
  browser = await chromium.launch({ args: ['--disable-features=LocalNetworkAccessChecks'] });
  kvman = await startKvman('en');
  localPage = createServer((_request, response) => response.writeHead(200, { 'content-type': 'text/html' }).end(framing(kvman.origin)));
  await new Promise<void>((resolve) => localPage.listen(0, '127.0.0.1', resolve));
});

afterAll(async () => {
  await browser.close();
  await kvman.close();
  await new Promise<void>((resolve) => localPage.close(() => resolve()));
});

const refusesFraming = (message: ConsoleMessage): boolean => message.text().includes('frame-ancestors');

describe('who may frame kvman (04 §4.2, ADR 0099, 9)', { timeout: 60_000 }, () => {
  it('M4.1-H2 a website cannot show kvman in a frame, and a local page on another port can', async () => {
    const website = await browser.newPage();
    await website.route('https://example.test/**', (route) => route.fulfill({ contentType: 'text/html', body: framing(kvman.origin) }));
    const refused = website.waitForEvent('console', { predicate: refusesFraming });
    await website.goto('https://example.test/');
    expect((await refused).text()).toContain("frame-ancestors 'self' http://127.0.0.1:* http://localhost:* vscode-webview: vscode-file:");
    await website.close();

    const local = await browser.newPage();
    await local.goto(`http://127.0.0.1:${String((localPage.address() as AddressInfo).port)}/`);
    const frame = local.frame({ name: 'kvman' });
    if (frame === null) throw new Error('The local page has no kvman frame.');
    await frame.waitForSelector('[data-test="nav"]');
    await local.close();
  });
});
