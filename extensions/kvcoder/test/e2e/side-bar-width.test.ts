import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { z } from '@kvman/sdk';
import { kvmanWorld, until, type KvmanWorld, type Running } from '../support/kvman-child.ts';
import { command, runs, says, shell } from '../support/model-script.ts';

// The chat at side-bar width, embedded as the VS Code view frames it (08 §8.7, ADR 0106, 2 and 6).

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
const boxSchema = z.object({ left: z.number(), right: z.number(), top: z.number(), bottom: z.number(), width: z.number() });
const rowSchema = z.object({ header: boxSchema, parts: z.array(boxSchema) });
type Box = z.infer<typeof boxSchema>;

const box = async (page: Page, selector: string): Promise<Box> => boxSchema.parse(await page.locator(selector).first().evaluate((element) => element.getBoundingClientRect().toJSON()));
const scrollsSideways = (page: Page): Promise<boolean> => page.evaluate('document.documentElement.scrollWidth > window.innerWidth');

// The header and each of its shown parts; a string, since it runs in Chromium.
const rowExpression = `(() => {
  const header = document.querySelector('.kvc-header');
  const parts = [...header.children].filter((part) => part.getClientRects().length > 0).map((part) => part.getBoundingClientRect().toJSON());
  return { header: header.getBoundingClientRect().toJSON(), parts };
})()`;

async function chat(script: Parameters<KvmanWorld['fake']['reply']>, text: string): Promise<{ kvman: Running; sessionId: string }> {
  world = await kvmanWorld();
  const kvman = await world.start();
  world.fake.reply(...script);
  const sessionId = sessionSchema.parse(await kvman.call('commands', 'kvcoder.session.create', { title: 'Fix the login form that fails after the redirect' })).id;
  await kvman.call('commands', 'kvcoder.message.send', { sessionId, text });
  await until(() => kvman.call('queries', 'kvcoder.session.get', { sessionId }), sessionSchema, (session) => session.status === 'idle');
  return { kvman, sessionId };
}

describe('the chat at side-bar width in Chromium (08 §8.7, ADR 0106)', { timeout: 120_000 }, () => {
  it('M4.8-H11 the header is one row with the Background chip as its dot and count, and the chat menu opens inside the view', async () => {
    const { kvman, sessionId } = await chat([runs(shell('echo "Serving on http://localhost:8124"; sleep 120', { background: true })), says('The server is running.')], 'serve the app');
    const page = await browser.newPage({ viewport: { width: 300, height: 800 } });
    await page.goto(`${kvman.origin}/kvcoder/session/${sessionId}?embed=parent`);
    await page.locator('[data-test="jobs-chip"]').waitFor();
    const row = rowSchema.parse(await page.evaluate(rowExpression));
    expect(row.header.bottom - row.header.top).toBeLessThanOrEqual(64);
    for (const part of row.parts) expect(part.top).toBeLessThan(row.header.top + 32);
    expect(await page.locator('[data-test="jobs-words"]').isVisible()).toBe(false);
    expect(await page.locator('[data-test="jobs-count"]').textContent()).toBe('1');
    expect(await page.locator('[data-test="jobs-chip"]').getAttribute('aria-label')).toBe('1 running');
    await page.locator('[data-test="chat-menu"]').click();
    const menu = await box(page, '[data-test="chat-menu-items"]');
    expect(menu.left).toBeGreaterThanOrEqual(0);
    expect(menu.right).toBeLessThanOrEqual(300);
    expect(await scrollsSideways(page)).toBe(false);
    await page.close();
  });

  it("M4.8-H12 the artifact head is two rows: the name at full width over the panel's buttons at the inline end, and a long word wraps", async () => {
    const { kvman, sessionId } = await chat([runs(command('artifact', 'write', { id: 'plan', title: 'Implementation plan for the login fix', content: `# The plan\n\nThe checkpoint ${'0123456789abcdef'.repeat(4)} stays.` })), says('Done.')], 'Write the plan');
    const page = await browser.newPage({ viewport: { width: 300, height: 800 } });
    await page.goto(`${kvman.origin}/kvcoder/session/${sessionId}?embed=parent`);
    await page.locator('[data-test="artifact-open"]').first().click();
    await page.locator('[data-test="artifact-panel"]').waitFor();
    const name = await box(page, '.kvc-artifact-name');
    const actions = await box(page, '.kvc-artifact-actions');
    const panel = await box(page, '[data-test="artifact-panel"]');
    expect(name.width).toBeGreaterThanOrEqual(200);
    expect(actions.top).toBeGreaterThanOrEqual(name.bottom);
    expect(actions.right).toBeGreaterThanOrEqual(panel.right - 24);
    await page.locator('[data-test="artifact-body"]', { hasText: 'stays.' }).waitFor();
    expect(await page.locator('[data-test="artifact-body"]').evaluate((body) => body.scrollWidth <= body.clientWidth)).toBe(true);
    expect(await scrollsSideways(page)).toBe(false);
    await page.close();
  });
});
