import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { startKvman, type RunningKvman } from './support/kvman.ts';

let browser: Browser;
let kvman: RunningKvman;

beforeAll(async () => {
  browser = await chromium.launch();
  kvman = await startKvman('en');
});

afterAll(async () => {
  await browser.close();
  await kvman.close();
});

const variables = ['background', 'surface', 'text', 'muted', 'border', 'primary', 'on-primary', 'danger', 'warning', 'success'].map((name) => `--kv-color-${name}`);

async function demoPage(): Promise<{ page: Page; requests: string[] }> {
  const page = await browser.newPage();
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/web/demo/components/')) requests.push(new URL(request.url()).pathname + new URL(request.url()).search);
  });
  await page.goto(`${kvman.origin}/demo/progress`);
  await page.locator('[data-test="demo-progress"]').waitFor();
  return { page, requests };
}

const style = (page: Page, selector: string, property: string) => page.evaluate(`getComputedStyle(document.querySelector('${selector}')).${property}`);

async function pickTheme(page: Page, theme: string): Promise<void> {
  await page.locator('button[aria-label^="Theme:"]').click();
  await page.locator(`[data-test="theme-${theme}"]`).click();
  await page.waitForFunction(`document.documentElement.classList.contains('dark') === ${String(theme === 'dark')}`);
}

// Page expressions are strings: they run in Chromium, where the DOM is, not in this Node process.
describe('custom components in Chromium (06 §6.4, ADR 0009, 83–85)', { timeout: 60_000 }, () => {
  it("M2.3-H1 a custom component shares kvwebui's Vue, streams a job's progress, renders Markdown through View, and its CSS loads", async () => {
    const { page, requests } = await demoPage();
    expect(await page.locator('[data-test="demo-progress"] h2').textContent()).toBe('Counting');
    expect(await style(page, '[data-test="demo-progress"]', 'borderTopColor')).toBe('rgb(53, 80, 122)');
    expect(await page.locator('[data-test="demo-progress"] strong').textContent()).toBe('done');
    await page.getByRole('button', { name: 'Start' }).click();
    await page.locator('[data-test="chunks"] li').first().waitFor();
    await page.getByRole('button', { name: 'Release' }).click();
    await page.locator('[data-test="result"]', { hasText: 'total' }).waitFor();
    // Chunks sent before the stream connected aren't seen (plan 04 §4.4); the rest arrive in order, up to the total.
    const chunks = (await page.locator('[data-test="chunks"] li').allTextContents()).map(Number);
    const first = chunks[0] ?? 0;
    expect(chunks).toEqual(chunks.map((_chunk, index) => first + index));
    expect(await page.locator('[data-test="result"]').textContent()).toBe(`total ${String(chunks.at(-1))}`);
    expect(requests).toEqual(expect.arrayContaining(['/web/demo/components/progress.js?revision=0', '/web/demo/components/progress.css?revision=0']));
    await page.close();
  });

  it('M2.3-H3 a component styled with the theme variables follows a theme switch', async () => {
    const { page } = await demoPage();
    await pickTheme(page, 'light');
    expect([await style(page, '[data-test="demo-progress"]', 'backgroundColor'), await style(page, '[data-test="demo-progress"]', 'color')]).toEqual(['rgb(247, 248, 250)', 'rgb(36, 42, 49)']);
    await pickTheme(page, 'dark');
    expect([await style(page, '[data-test="demo-progress"]', 'backgroundColor'), await style(page, '[data-test="demo-progress"]', 'color')]).toEqual(['rgb(29, 28, 26)', 'rgb(236, 234, 228)']);
    await pickTheme(page, 'light');
    await page.close();
  });

  it('M2.3-E5 a component without a CSS file still renders', async () => {
    const { page, requests } = await demoPage();
    await page.locator('[data-test="demo-plain"]').waitFor();
    expect(requests).toEqual(expect.arrayContaining(['/web/demo/components/plain.js?revision=0', '/web/demo/components/plain.css?revision=0']));
    expect(await page.locator('link[href*="plain.css"]').count()).toBe(0);
    await page.close();
  });

  it('M2.3-E16 the theme variables exist for light and dark', async () => {
    const { page } = await demoPage();
    const read = (): Promise<unknown> => page.evaluate(`(() => { const root = getComputedStyle(document.documentElement); return ${JSON.stringify([...variables, '--kv-space-sm', '--kv-space-md', '--kv-space-lg', '--kv-radius', '--kv-font-mono'])}.map((name) => root.getPropertyValue(name).trim()); })()`);
    await pickTheme(page, 'light');
    const light = (await read()) as string[];
    await pickTheme(page, 'dark');
    const dark = (await read()) as string[];
    await pickTheme(page, 'light');
    expect(light.every((value) => value !== '')).toBe(true);
    expect(dark.every((value) => value !== '')).toBe(true);
    expect(light.slice(variables.length, variables.length + 4)).toEqual(['8px', '16px', '24px', '12px']);
    expect(light.at(-1)).toContain('IBM Plex Mono');
    expect(variables.filter((_name, index) => light[index] === dark[index])).toEqual([]);
    await page.close();
  });
});
