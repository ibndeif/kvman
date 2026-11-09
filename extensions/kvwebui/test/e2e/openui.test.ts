import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { startKvman, type RunningKvman } from './support/kvman.ts';

let browser: Browser;
const running: RunningKvman[] = [];

beforeAll(async () => {
  browser = await chromium.launch();
});

afterAll(async () => {
  await browser.close();
  for (const kvman of running) await kvman.close();
});

async function started(language: string, settings: Record<string, unknown> = {}): Promise<RunningKvman> {
  const kvman = await startKvman(language, settings);
  running.push(kvman);
  return kvman;
}

async function gallery(kvman: RunningKvman): Promise<{ page: Page; requests: string[] }> {
  const page = await browser.newPage();
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.goto(`${kvman.origin}/demo/gallery`);
  await page.locator('[data-test="demo-openui"] [data-test="openui"]').first().waitFor();
  await page.locator('[data-test="demo-openui"] button[aria-label="Launch"] svg').waitFor();
  return { page, requests };
}

// Page expressions are strings: they run in Chromium, where the DOM is, not in this Node process.
// White or black that no theme color resolves to (the theme's own on-primary may be white).
const pureColors = `(() => {
  const probe = document.createElement('span');
  document.body.append(probe);
  const theme = new Set(['background', 'surface', 'text', 'muted', 'border', 'primary', 'on-primary', 'danger', 'warning', 'success'].map((name) => {
    probe.style.color = 'var(--kv-color-' + name + ')';
    return getComputedStyle(probe).color;
  }));
  probe.remove();
  return [...document.querySelectorAll('[data-test="demo-openui"] *')]
    .filter((element) => !(element instanceof HTMLInputElement && ['checkbox', 'radio', 'range'].includes(element.type)))
    .flatMap((element) => {
      const style = getComputedStyle(element);
      return [style.color, style.backgroundColor].filter((color) => (color === 'rgb(255, 255, 255)' || color === 'rgb(0, 0, 0)') && !theme.has(color)).map((color) => element.tagName + ' ' + color);
    });
})()`;

const left = (selector: string): string => `document.querySelector('${selector}').getBoundingClientRect().left`;

describe('OpenUI in Chromium (06 §6.1, ADR 0124)', { timeout: 120_000 }, () => {
  it("M5.18-H10 an icon's module loads only when a block first shows it, and draws the icon", async () => {
    const kvman = await started('en');
    const page = await browser.newPage();
    const scripts: string[] = [];
    page.on('request', (request) => {
      if (request.resourceType() === 'script') scripts.push(new URL(request.url()).pathname);
    });
    await page.goto(`${kvman.origin}/demo/progress`);
    await page.locator('[data-test="demo-progress"]').waitFor();
    expect(scripts.filter((name) => /\/rocket[-.]/.test(name))).toEqual([]);
    await page.goto(`${kvman.origin}/demo/icons`);
    await page.locator('[data-test="openui"] button[aria-label="Launch"] svg').waitFor();
    expect(scripts.filter((name) => /\/rocket[-.]/.test(name))).toHaveLength(1);
    expect(await page.evaluate(`document.querySelectorAll('[data-test="openui"] svg').length`)).toBe(2);
    await page.close();
  });

  it('M5.18-E10 drawing every component and pressing them makes no request but to kvman', async () => {
    const kvman = await started('en');
    const { page, requests } = await gallery(kvman);
    await page.getByRole('button', { name: 'Go', exact: true }).click();
    await page.getByRole('button', { name: 'Launch' }).click();
    await page.getByRole('button', { name: 'Tell me more' }).click();
    await page.locator('input[name="name"]').fill('Ada');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await page.getByRole('tab', { name: 'Second' }).click();
    await page.locator('[data-test="sent"]').filter({ hasText: 'Book it' }).waitFor();
    expect(await page.locator('[data-test="sent"]').textContent()).toBe('Go now|Launch|Tell me more|Book it\n\nName: Ada\nNotes: (empty)\nRoom: (empty)\nDay: (empty)\nGuests: 2\nExtras: (empty)\nSize: (empty)\nColors: (empty)');
    expect(await page.locator('[data-test="openui-image-placeholder"]').textContent()).toBe('chart (https://example.com/chart.png)');
    expect(requests.filter((url) => !url.startsWith(kvman.origin))).toEqual([]);
    await page.close();
  });

  it('M5.18-H11 M5.19-H7 the components use the theme in light and in dark, never pure white or black', async () => {
    for (const theme of ['light', 'dark']) {
      const kvman = await started('en', { 'kvwebui.theme': theme });
      const { page } = await gallery(kvman);
      expect(await page.evaluate(pureColors), theme).toEqual([]);
      await page.close();
    }
  });

  it('M5.18-H11 M5.19-H7 in Arabic the stack, the tabs, the steps, the form labels, a bar chart, and a table mirror, its numbers left to right', async () => {
    const kvman = await started('ar');
    const { page } = await gallery(kvman);
    expect(await page.evaluate('document.documentElement.dir')).toBe('rtl');
    const tabs = await page.evaluate(`[...document.querySelectorAll('[role="tab"]')].map((tab) => tab.getBoundingClientRect().left)`);
    expect(Array.isArray(tabs) && Number(tabs[0]) > Number(tabs[1])).toBe(true);
    const cards = await page.evaluate(`[...document.querySelectorAll('.kvwebui-openui-stack .kvwebui-openui-stack > section')].map((card) => card.getBoundingClientRect().left)`);
    expect(Array.isArray(cards) && Number(cards[0]) > Number(cards[1])).toBe(true);
    const number = await page.evaluate(left('[data-test="demo-openui"] ol li span[aria-hidden="true"]'));
    const title = await page.evaluate(left('[data-test="demo-openui"] ol li p'));
    expect(Number(number)).toBeGreaterThan(Number(title));
    const categories = await page.evaluate(`[...document.querySelectorAll('[data-test="chart-category"]')].map((label) => label.getBoundingClientRect().left)`);
    expect(Array.isArray(categories) && Number(categories[0]) > Number(categories[1])).toBe(true);
    const valueTick = await page.evaluate(left('[data-test="chart-value-tick"]'));
    expect(Number(valueTick)).toBeGreaterThan(Number(Array.isArray(categories) ? categories[0] : 0));
    expect(await page.evaluate(`getComputedStyle(document.querySelector('[data-test="chart-value-tick"]')).direction`)).toBe('ltr');
    const headers = await page.evaluate(`[...document.querySelectorAll('[data-test="demo-openui"] thead th')].map((cell) => cell.getBoundingClientRect().left)`);
    expect(Array.isArray(headers) && Number(headers[0]) > Number(headers[1])).toBe(true);
    const label = await page.evaluate(`document.querySelector('label[for]').getBoundingClientRect().right`);
    const field = await page.evaluate(`document.querySelector('input[name="name"]').getBoundingClientRect().right`);
    expect(Math.abs(Number(label) - Number(field))).toBeLessThan(2);
    await page.close();
  });
});
