import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { chromium, type Browser, type Frame, type Page } from 'playwright';
import { z } from '@kvman/sdk';
import { kvmanWorld, until, type KvmanWorld, type Running } from '../support/kvman-child.ts';
import { artifactCommand, calls, says } from '../support/model-script.ts';

let browser: Browser;
let world: KvmanWorld | undefined;
let closeForeign: (() => Promise<void>) | undefined;

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser.close();
});

afterEach(async () => {
  await closeForeign?.();
  closeForeign = undefined;
  await world?.close();
  world = undefined;
});

const sessionSchema = z.object({ id: z.string(), status: z.string() });
const reportSchema = z.object({ results: z.record(z.string(), z.string()), violations: z.array(z.string()) });

// A server on another port that any request from an artifact would reach: it must never be asked anything.
async function foreignServer(): Promise<{ origin: string; hits: string[] }> {
  const hits: string[] = [];
  const server = createServer((request, response) => {
    hits.push(`${request.method ?? ''} ${request.url ?? ''}`);
    response.writeHead(200, { 'access-control-allow-origin': '*', 'content-type': 'text/plain' }).end('reached');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  closeForeign = () => new Promise<void>((resolve) => server.close(() => resolve()));
  return { origin: `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`, hits };
}

// The page of a probe: it tries to get out, counts the policy violations it is reported (one per blocked attempt), and
// writes what happened to #out. Waiting for the violations, not for a delay, is what makes "blocked" observable.
function probeScript(kvman: string, foreign: string, expected: number): string {
  return `<script>
const kvman = ${JSON.stringify(kvman)};
const foreign = ${JSON.stringify(foreign)};
const results = {};
const violations = [];
addEventListener('securitypolicyviolation', (event) => violations.push(event.effectiveDirective));
const attempt = async (name, run) => {
  try { results[name] = await run(); } catch (error) { results[name] = 'blocked: ' + error.name; }
};
const load = (element, url) => new Promise((resolve) => { element.onload = () => resolve('loaded'); element.onerror = () => resolve('blocked: error'); element.src = url; document.body.append(element); });
(async () => {
  await attempt('own', () => { document.body.dataset.ran = 'yes'; return document.body.dataset.ran; });
  await attempt('fetch-kvman', async () => 'got ' + (await fetch(kvman + '/api/queries/kvcoder.session.list', { method: 'POST', body: '{}' })).status);
  await attempt('fetch-foreign', async () => 'got ' + (await fetch(foreign + '/fetch')).status);
  await attempt('parent', () => window.parent.document.title);
  await attempt('cookie', () => document.cookie);
  await attempt('storage', () => String(localStorage.length));
  await attempt('popup', () => (window.open(foreign + '/popup') === null ? 'blocked: null' : 'opened'));
  await attempt('image', () => load(new Image(), foreign + '/image'));
  await attempt('script', () => load(document.createElement('script'), foreign + '/script.js'));
  await attempt('websocket', () => new Promise((resolve, reject) => { const socket = new WebSocket(foreign.replace('http', 'ws')); socket.onopen = () => resolve('open'); socket.onerror = () => reject(new Error('x')); }));
  await attempt('form', () => { const form = document.createElement('form'); form.action = foreign + '/form'; form.method = 'post'; document.body.append(form); form.submit(); return 'submitted'; });
  await attempt('frame-foreign', () => load(document.createElement('iframe'), foreign + '/frame'));
  await attempt('frame-kvman', () => load(document.createElement('iframe'), kvman + '/api/health'));
  await attempt('top', () => { window.top.location.href = foreign + '/top'; return 'navigated'; });
  await attempt('parent-nav', () => { window.parent.location.href = foreign + '/parent'; return 'navigated'; });
  const deadline = Date.now() + 5000;
  await new Promise((resolve) => { const check = () => (violations.length >= ${String(expected)} || Date.now() > deadline ? resolve() : setTimeout(check, 20)); check(); });
  document.getElementById('out').textContent = JSON.stringify({ results, violations });
})();
</script>`;
}

const page = (kvman: string, foreign: string, extra = '', expected = 7): string => `<!doctype html><html><head>${extra}</head><body><pre id="out">running</pre>${probeScript(kvman, foreign, expected)}</body></html>`;

// Opens the artifact in the app, as the person does from its card, and returns the page and the artifact's frame.
async function openProbe(kvman: Running, content: string): Promise<{ app: Page; outer: Frame; frame: Frame }> {
  const active = world;
  if (active === undefined) throw new Error('no world');
  active.fake.reply(calls(artifactCommand('write', { id: 'probe', title: 'Probe', format: 'html', content })), says('Done.'));
  const sessionId = sessionSchema.parse(await kvman.call('commands', 'kvcoder.session.create', { title: 'Isolation' })).id;
  await kvman.call('commands', 'kvcoder.message.send', { sessionId, text: 'Show the probe' });
  await until(() => kvman.call('queries', 'kvcoder.session.get', { sessionId }), sessionSchema, (session) => session.status === 'idle');
  const app = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await app.goto(`${kvman.origin}/kvcoder/session/${sessionId}`);
  await app.locator('[data-test="artifact-open"]').click();
  const outer = await (await app.locator('[data-test="artifact-frame"]').elementHandle())?.contentFrame();
  if (outer === null || outer === undefined) throw new Error('the artifact has no frame');
  await outer.locator('iframe').waitFor({ state: 'attached' });
  const frame = await (await outer.locator('iframe').elementHandle())?.contentFrame();
  if (frame === null || frame === undefined) throw new Error('the artifact has no inner frame');
  return { app, outer, frame };
}

async function report(frame: Frame) {
  await frame.locator('#out:not(:text("running"))').waitFor({ timeout: 20_000 });
  return reportSchema.parse(JSON.parse((await frame.locator('#out').textContent()) ?? ''));
}

describe("an HTML artifact is walled in, in Chromium (08 §8.7, ADR 0009, 178 and 179)", { timeout: 120_000 }, () => {
  it('QA6-H20 and QA6-E20 its script runs and edits its own page, and every attempt to get out fails', async () => {
    world = await kvmanWorld();
    const kvman = await world.start();
    const foreign = await foreignServer();
    const { app, outer, frame } = await openProbe(kvman, page(kvman.origin, foreign.origin));
    const navigations: string[] = [];
    const popups: string[] = [];
    const fromFrame: string[] = [];
    app.on('framenavigated', (navigated) => navigations.push(navigated === app.mainFrame() ? navigated.url() : ''));
    app.on('popup', (popup) => popups.push(popup.url()));
    app.on('request', (request) => ((request.frame() === frame || request.frame() === outer) && request.url().startsWith(kvman.origin) ? fromFrame.push(request.url()) : undefined));
    const { results, violations } = await report(frame);
    expect(results['own']).toBe('yes');
    for (const name of ['fetch-kvman', 'fetch-foreign', 'parent', 'cookie', 'storage', 'popup', 'image', 'script', 'websocket']) expect(results[name], name).toMatch(/^blocked/);
    expect(violations).toEqual(expect.arrayContaining(['connect-src', 'img-src', 'script-src-elem', 'frame-src']));
    expect(foreign.hits).toEqual([]);
    expect(popups).toEqual([]);
    expect(navigations.filter((url) => url !== '')).toEqual([]);
    expect(fromFrame).toEqual([]);
    expect(frame.childFrames().every((child) => !child.url().startsWith(kvman.origin) && !child.url().startsWith(foreign.origin))).toBe(true);
    await app.close();
  });

  it("QA6-E16 content's own policy, base, and external script can't loosen the wall", async () => {
    world = await kvmanWorld();
    const kvman = await world.start();
    const foreign = await foreignServer();
    const loose = `<meta http-equiv="Content-Security-Policy" content="default-src * 'unsafe-inline' 'unsafe-eval'"><base href="${foreign.origin}/base/"><script src="${foreign.origin}/external.js"></script>`;
    const { app, frame } = await openProbe(kvman, page(kvman.origin, foreign.origin, loose, 9));
    const { results, violations } = await report(frame);
    expect(results['own']).toBe('yes');
    expect(results['fetch-foreign']).toMatch(/^blocked/);
    expect(violations).toEqual(expect.arrayContaining(['base-uri', 'script-src-elem', 'connect-src']));
    expect(foreign.hits).toEqual([]);
    await app.close();
  });

  it('QA6-E17 a nested frame can neither load kvman nor another origin', async () => {
    world = await kvmanWorld();
    const kvman = await world.start();
    const foreign = await foreignServer();
    const { app, frame } = await openProbe(kvman, page(kvman.origin, foreign.origin));
    const { results } = await report(frame);
    expect(results['frame-kvman']).toBeDefined();
    expect(frame.childFrames().map((child) => child.url()).filter((url) => url.startsWith('http'))).toEqual([]);
    expect(foreign.hits).toEqual([]);
    await app.close();
  });

  it('QA6-E18 a link with target _blank opens nothing and navigates nothing', async () => {
    world = await kvmanWorld();
    const kvman = await world.start();
    const foreign = await foreignServer();
    const content = `<!doctype html><body><a id="link" href="${foreign.origin}/link" target="_blank">go</a><a id="same" href="${foreign.origin}/same">same</a><pre id="out">ready</pre></body>`;
    const { app, frame } = await openProbe(kvman, content);
    const popups: string[] = [];
    const navigations: string[] = [];
    app.on('popup', (popup) => popups.push(popup.url()));
    app.on('framenavigated', (navigated) => navigations.push(navigated.url()));
    await frame.locator('#link').click();
    await frame.locator('#same').click();
    await expect(app.waitForEvent('popup', { timeout: 1000 })).rejects.toThrow();
    expect(popups).toEqual([]);
    expect(navigations.filter((url) => url.startsWith(foreign.origin))).toEqual([]);
    expect(foreign.hits).toEqual([]);
    await app.close();
  });

  it('QA6-E27 a script that navigates its own frame is stopped, and nothing reaches the other server', async () => {
    world = await kvmanWorld();
    const kvman = await world.start();
    const foreign = await foreignServer();
    const { app, frame } = await openProbe(kvman, `<!doctype html><body><p>ready</p><script>location.href = ${JSON.stringify(`${foreign.origin}/self`)};</script></body>`);
    await vi.waitFor(() => expect(frame.url()).not.toBe('about:srcdoc'), { timeout: 20_000 });
    expect(frame.url()).not.toContain(foreign.origin);
    expect(foreign.hits).toEqual([]);
    await app.close();
  });
});
