import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { startKvman, type RunningKvman } from './support/kvman.ts';

let browser: Browser;
let kvman: RunningKvman;
let root: string;

beforeAll(async () => {
  browser = await chromium.launch();
  kvman = await startKvman('en');
  root = realpathSync(mkdtempSync(path.join(tmpdir(), 'kvman-folders-')));
  mkdirSync(path.join(root, 'alpha', 'beta'), { recursive: true });
  mkdirSync(path.join(root, 'alpha', '.secret'));
  mkdirSync(path.join(root, 'other'));
});

afterAll(async () => {
  await browser.close();
  await kvman.close();
  rmSync(root, { recursive: true, force: true });
});

describe('the folder browser in Chromium (06 §6.2, ADR 0009, 220)', { timeout: 60_000 }, () => {
  it('QA13-H7 the person goes into folders by clicking, opens one, and the picker shows it as the current workspace', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(kvman.origin);
    await page.locator('button[aria-label^="Workspace:"]').click();
    await page.locator('[data-test="open-folder"]').click();
    await page.locator('[data-test="folder-list"]').waitFor();
    await page.locator('[data-test="folder-path"]').fill(root);
    await page.locator('[data-test="folder-path"]').press('Enter');
    await page.locator('[data-test="folder-entry-alpha"]').waitFor();
    expect(await page.locator('[data-test^="folder-entry-"]').allTextContents()).toEqual(['alpha', 'other']);
    await page.locator('[data-test="folder-entry-alpha"]').click();
    await page.locator('[data-test="folder-entry-beta"]').waitFor();
    expect(await page.locator('[data-test="folder-entry-.secret"]').count()).toBe(0);
    await page.locator('[data-test="folder-hidden"]').check();
    await page.locator('[data-test="folder-entry-.secret"]').waitFor();
    await page.locator('[data-test="folder-up"]').click();
    await page.locator('[data-test="folder-entry-other"]').waitFor();
    await page.locator('[data-test="folder-entry-alpha"]').click();
    await page.locator('[data-test="folder-entry-beta"]').click();
    await page.locator('[data-test="folder-path"]').waitFor();
    await page.waitForFunction(`document.querySelector('[data-test="folder-path"]').value === ${JSON.stringify(path.join(root, 'alpha', 'beta'))}`);
    await page.locator('[data-test="folder-open"]').click();
    await page.locator('[data-test="folder-list"]').waitFor({ state: 'detached' });
    expect(await page.locator('[data-test="workspace-current"]').textContent()).toBe('beta');
    await page.close();
  });
});
