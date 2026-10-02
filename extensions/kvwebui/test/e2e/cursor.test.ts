import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { z } from '@kvman/sdk';
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

const cursorsSchema = z.object({ navToggle: z.string(), theme: z.string(), button: z.string(), disabledButton: z.string(), select: z.string(), summary: z.string(), link: z.string() });

// Page expressions are strings: they run in Chromium, where the DOM is, not in this Node process.
const probe = `(() => {
  const cursor = (element) => getComputedStyle(element).cursor;
  const add = (tag, props) => document.body.appendChild(Object.assign(document.createElement(tag), props));
  const details = add('details', {});
  const summary = details.appendChild(document.createElement('summary'));
  return {
    navToggle: cursor(document.querySelector('[data-test="nav-toggle"]')),
    theme: cursor(document.querySelector('button[aria-label^="Theme:"]')),
    button: cursor(add('button', {})),
    disabledButton: cursor(add('button', { disabled: true })),
    select: cursor(add('select', {})),
    summary: cursor(summary),
    link: cursor(add('a', { href: '#x' })),
  };
})()`;

describe('the hand on every control (06 §6.1, ADR 0009, 209)', { timeout: 60_000 }, () => {
  it('QA10-H12 the frame, buttons, links, summaries, and selects show the hand, and a disabled button does not', async () => {
    const page = await browser.newPage();
    await page.goto(kvman.origin);
    await page.locator('[data-test="nav-toggle"]').waitFor();
    const cursors = cursorsSchema.parse(await page.evaluate(probe));
    expect(cursors).toEqual({ navToggle: 'pointer', theme: 'pointer', button: 'pointer', disabledButton: 'default', select: 'pointer', summary: 'pointer', link: 'pointer' });
    await page.close();
  });
});
