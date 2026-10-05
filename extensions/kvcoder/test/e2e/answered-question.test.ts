import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser } from 'playwright';
import { z } from '@kvman/sdk';
import { kvmanWorld, type KvmanWorld } from '../support/kvman-child.ts';
import { command, runs, says } from '../support/model-script.ts';

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

const sessionSchema = z.object({ id: z.string() });

const question = {
  prompt: 'ما مجموعة الوظائف التي تريدها في النسخة الأولى؟',
  multiple: true,
  options: [
    { id: 'core', label: 'الأساسيات', description: 'إضافة، إنجاز، تعديل، وحذف المهام.' },
    { id: 'organize', label: 'تنظيم متقدم', description: 'أولوية، تاريخ استحقاق، وتصنيفات.' },
    { id: 'search', label: 'بحث وتصفية' },
  ],
};

describe('an answered question in Chromium (08 §8.7, ADR 0013, 1)', { timeout: 120_000 }, () => {
  it('QA20-H12 after the person answers a choice, the conversation shows the question with the chosen options, and no JSON', async () => {
    world = await kvmanWorld();
    const kvman = await world.start();
    world.fake.reply(runs(command('ask', 'choice', question)), says('Done.'));
    const sessionId = sessionSchema.parse(await kvman.call('commands', 'kvcoder.session.create', { title: 'Scope' })).id;
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`${kvman.origin}/kvcoder/session/${sessionId}`);
    await page.locator('[data-test="composer-text"]').fill('Build it');
    await page.locator('[data-test="send"]').click();
    await page.locator('[data-test="question-card"]').waitFor();
    await page.locator('[data-test="option-search"] input').check();
    await page.locator('[data-test="option-core"] input').check();
    await page.locator('[data-test="answer"]').click();

    const answered = page.locator('[data-test="answered-card"]');
    await answered.waitFor();
    expect(await answered.locator('[data-test="answered-prompt"]').textContent()).toBe(question.prompt);
    const chosen = await answered.locator('[data-test^="answered-option-"]').evaluateAll((options) => options.map((option) => [option.getAttribute('data-test'), option.getAttribute('data-chosen')]));
    expect(chosen).toEqual([['answered-option-core', 'true'], ['answered-option-organize', 'false'], ['answered-option-search', 'true']]);
    expect(await answered.textContent()).not.toContain('"selected"');
    expect(await page.locator('[data-test="question-card"]').count()).toBe(0);
    expect(await page.locator('[data-test="call-card"]').count()).toBe(0);
    await page.close();
  });
});
