import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { z } from '@kvman/sdk';
import { startKvman, type RunningKvman } from './support/kvman.ts';

let browser: Browser;
let kvman: RunningKvman;
let arabic: RunningKvman;
let root: string;

const workspacesSchema = z.object({ ok: z.literal(true), output: z.array(z.object({ id: z.string(), name: z.string(), path: z.string() })) });

beforeAll(async () => {
  browser = await chromium.launch();
  kvman = await startKvman('en');
  arabic = await startKvman('ar');
  root = realpathSync(mkdtempSync(path.join(tmpdir(), 'kvman-folders-')));
  mkdirSync(path.join(root, 'alpha', 'beta'), { recursive: true });
  mkdirSync(path.join(root, 'alpha', 'gamma'));
  mkdirSync(path.join(root, 'alpha', '.secret'));
  mkdirSync(path.join(root, 'other'));
});

afterAll(async () => {
  await browser.close();
  await kvman.close();
  await arabic.close();
  rmSync(root, { recursive: true, force: true });
});

// Opens the dialog and goes to `folder` by typing its path, as a person may.
async function openDialogAt(page: Page, folder: string): Promise<void> {
  await page.locator('button:has([data-test="workspace-current"])').click();
  await page.locator('[data-test="open-folder"]').click();
  await page.locator('[data-test="folder-list"]').waitFor();
  await page.locator('[data-test="folder-path"]').fill(folder);
  await page.locator('[data-test="folder-path"]').press('Enter');
  await page.waitForFunction(`document.querySelector('[data-test="folder-crumbs"] [aria-current="location"]')?.textContent === ${JSON.stringify(path.basename(folder))}`);
}

const names = (page: Page): Promise<string[]> => page.locator('[data-test^="folder-entry-"]').allTextContents().then((all) => all.map((text) => text.trim().replace(/Open$/, '').trim()));
const lastCrumb = (page: Page): Promise<string | null> => page.locator('[data-test="folder-crumbs"] [aria-current="location"]').textContent();

describe('the folder browser in Chromium (06 §6.2, ADR 0009, 220 and 222 to 225)', { timeout: 90_000 }, () => {
  it('QA13-H7 the person goes into folders by clicking, opens one, and the picker shows it as the current workspace', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(kvman.origin);
    await openDialogAt(page, root);
    expect(await names(page)).toEqual(['alpha', 'other']);
    await page.locator('[data-test="folder-entry-alpha"]').click();
    await page.locator('[data-test="folder-entry-beta"]').waitFor();
    expect(await page.locator('[data-test="folder-entry-.secret"]').count()).toBe(0);
    await page.locator('[data-test="folder-hidden"]').check();
    await page.locator('[data-test="folder-entry-.secret"]').waitFor();
    await page.locator('[data-test="folder-up"]').click();
    await page.locator('[data-test="folder-entry-other"]').waitFor();
    await page.locator('[data-test="folder-entry-alpha"]').click();
    await page.locator('[data-test="folder-entry-beta"]').click();
    await page.waitForFunction(`document.querySelector('[data-test="folder-path"]').value === ${JSON.stringify(path.join(root, 'alpha', 'beta'))}`);
    await page.locator('[data-test="folder-open"]').click();
    await page.locator('[data-test="folder-list"]').waitFor({ state: 'detached' });
    expect(await page.locator('[data-test="workspace-current"]').textContent()).toBe('beta');
    await page.close();
  });

  it('QA14-H2 a new folder is made from the dialog, entered, and opened as a workspace, end to end', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(kvman.origin);
    await openDialogAt(page, path.join(root, 'other'));
    await page.locator('[data-test="folder-new"]').click();
    await page.locator('[data-test="folder-new-name"]').fill('fresh project');
    await page.locator('[data-test="folder-create"]').click();
    await page.waitForFunction(`document.querySelector('[data-test="folder-crumbs"] [aria-current="location"]')?.textContent === 'fresh project'`);
    const made = path.join(root, 'other', 'fresh project');
    expect(existsSync(made)).toBe(true);
    expect(await page.locator('[data-test="folder-new-row"]').count()).toBe(0);
    await page.locator('[data-test="folder-empty"]').waitFor();
    await page.locator('[data-test="folder-open"]').click();
    await page.locator('[data-test="folder-list"]').waitFor({ state: 'detached' });
    expect(await page.locator('[data-test="workspace-current"]').textContent()).toBe('fresh project');
    expect(await page.locator('[data-test="status-workspace"]').getAttribute('title')).toBe(made);
    const answer = workspacesSchema.parse(await (await fetch(`${kvman.origin}/api/queries/kernel.workspace.list`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input: {}, workspaceId: 'home' }) })).json());
    expect(answer.output.map((workspace) => workspace.path)).toContain(made);
    await page.close();
  });

  it('QA14-E7 a refused name shows why in a real browser, and the dialog stays where it was', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(kvman.origin);
    await openDialogAt(page, root);
    await page.locator('[data-test="folder-new"]').click();
    await page.locator('[data-test="folder-new-name"]').fill('alpha');
    await page.locator('[data-test="folder-create"]').click();
    await page.locator('[data-test="folder-new-issue"]').waitFor();
    expect(await page.locator('[data-test="folder-new-issue"]').textContent()).toBe('A folder or file named alpha already exists here.');
    expect(await lastCrumb(page)).toBe(path.basename(root));
    expect(await page.locator('[data-test="folder-new-name"]').inputValue()).toBe('alpha');
    await page.close();
  });

  it('QA14-H13 the keyboard and the breadcrumbs move through the tree', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(kvman.origin);
    await openDialogAt(page, root);
    await page.locator('[data-test="folder-filter"]').focus();
    await page.keyboard.type('alp');
    expect(await names(page)).toEqual(['alpha']);
    await page.keyboard.press('Enter');
    await page.waitForFunction(`document.querySelector('[data-test="folder-crumbs"] [aria-current="location"]')?.textContent === 'alpha'`);
    await page.locator('[data-test="folder-filter"]').focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    expect(await page.locator('[data-test="folder-list"] [aria-selected="true"]').textContent()).toContain('gamma');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Enter');
    await page.waitForFunction(`document.querySelector('[data-test="folder-crumbs"] [aria-current="location"]')?.textContent === 'beta'`);
    await page.locator('[data-test="folder-crumb-0"]').waitFor();
    const crumbs = await page.locator('[data-test^="folder-crumb-"]').count();
    await page.locator(`[data-test="folder-crumb-${String(crumbs - 2)}"]`).click();
    await page.waitForFunction(`document.querySelector('[data-test="folder-crumbs"] [aria-current="location"]')?.textContent === 'alpha'`);
    await page.locator('[data-test="folder-filter"]').focus();
    await page.keyboard.press('Backspace');
    await page.waitForFunction(`document.querySelector('[data-test="folder-crumbs"] [aria-current="location"]')?.textContent === ${JSON.stringify(path.basename(root))}`);
    await page.locator('[data-test="folder-back"]').click();
    await page.waitForFunction(`document.querySelector('[data-test="folder-crumbs"] [aria-current="location"]')?.textContent === 'alpha'`);
    await page.close();
  });

  it('QA14-E11 the dialog fits narrow windows, in English and in Arabic', async () => {
    for (const [running, language] of [[kvman, 'en'], [arabic, 'ar']] as const) {
      for (const width of [360, 600]) {
        const page = await browser.newPage({ viewport: { width, height: 700 } });
        await page.goto(running.origin);
        await openDialogAt(page, root);
        const found = z.object({ sideways: z.boolean(), dialog: z.object({ left: z.number(), right: z.number() }), buttons: z.array(z.object({ left: z.number(), right: z.number() })) }).parse(await page.evaluate(`(() => {
          const box = (selector) => { const { left, right } = document.querySelector(selector).getBoundingClientRect(); return { left, right }; };
          return { sideways: document.documentElement.scrollWidth > innerWidth, dialog: box('[role="dialog"]'), buttons: ['[data-test="folder-open"]', '[data-test="folder-new"]', '[data-test="folder-up"]'].map(box) };
        })()`));
        expect(found.sideways, `${language} ${String(width)} sideways`).toBe(false);
        for (const box of [found.dialog, ...found.buttons]) {
          expect(box.left, `${language} ${String(width)} left`).toBeGreaterThanOrEqual(-1);
          expect(box.right, `${language} ${String(width)} right`).toBeLessThanOrEqual(width + 1);
        }
        await page.close();
      }
    }
  });
});
