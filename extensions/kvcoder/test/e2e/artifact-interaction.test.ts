import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Frame } from 'playwright';
import { z } from '@kvman/sdk';
import { kvmanWorld, until, type KvmanWorld, type Running } from '../support/kvman-child.ts';
import { command, runs, says } from '../support/model-script.ts';

let browser: Browser;
let world: KvmanWorld | undefined;
beforeAll(async () => { browser = await chromium.launch(); });
afterAll(async () => { await browser.close(); });
afterEach(async () => { await world?.close(); world = undefined; });

const sessionSchema = z.object({ id: z.string(), status: z.string() });
const list = '<input id="text" /><button id="add" type="button">Add</button><ul id="items"></ul>';
const add = "const add = () => { const item = document.createElement('li'); item.textContent = document.getElementById('text').value; document.getElementById('items').append(item); };";
// As the description asks: the button's click and the field's Enter key, in JavaScript.
const handled = `<!doctype html><html><body>${list}<script>${add} document.getElementById('add').addEventListener('click', add); document.getElementById('text').addEventListener('keydown', (event) => { if (event.key === 'Enter') add(); });</script></body></html>`;
// What the review found broken: the same page relying on a form's submit.
const submitted = `<!doctype html><html><body><form id="form">${list.replace('type="button"', 'type="submit"')}</form><script>${add} document.getElementById('form').addEventListener('submit', (event) => { event.preventDefault(); add(); });</script></body></html>`;

async function panelFrame(kvman: Running, content: string): Promise<Frame> {
  const active = world;
  if (active === undefined) throw new Error('no world');
  active.fake.reply(runs(command('artifact', 'write', { id: 'todo', title: 'Todo', format: 'html', content })), says('Done.'));
  const sessionId = sessionSchema.parse(await kvman.call('commands', 'kvcoder.session.create', { title: 'Interaction' })).id;
  await kvman.call('commands', 'kvcoder.message.send', { sessionId, text: 'Show it' });
  await until(() => kvman.call('queries', 'kvcoder.session.get', { sessionId }), sessionSchema, (session) => session.status === 'idle');
  const app = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await app.goto(`${kvman.origin}/kvcoder/session/${sessionId}`);
  await app.locator('[data-test="artifact-open"]').click();
  const outer = await (await app.locator('[data-test="artifact-frame"]').elementHandle())?.contentFrame();
  if (outer === null || outer === undefined) throw new Error('the artifact has no frame');
  await outer.locator('iframe').waitFor({ state: 'attached' });
  const frame = await (await outer.locator('iframe').elementHandle())?.contentFrame();
  if (frame === null || frame === undefined) throw new Error('the artifact has no inner frame');
  return frame;
}

describe('a generated page works inside the artifact panel (KVC-27)', { timeout: 120_000 }, () => {
  it('M2.4-E188 a button click and the Enter key handled in JavaScript add items', async () => {
    world = await kvmanWorld();
    const frame = await panelFrame(await world.start(), handled);
    await frame.locator('#text').fill('milk');
    await frame.locator('#add').click();
    await frame.locator('#text').fill('bread');
    await frame.locator('#text').press('Enter');
    await expect.poll(() => frame.locator('#items li').allTextContents()).toEqual(['milk', 'bread']);
  });

  it("M2.4-E188 a page that relies on a form's submit adds nothing, as the description says", async () => {
    world = await kvmanWorld();
    const frame = await panelFrame(await world.start(), submitted);
    await frame.locator('#text').fill('milk');
    await frame.locator('#add').click();
    await frame.locator('#text').press('Enter');
    await frame.locator('#text').fill('still here');
    expect(await frame.locator('#items li').count()).toBe(0);
  });
});
