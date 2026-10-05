import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import { kvcoderFolder, useKvcoder } from './support/kvcoder-kernel.ts';

const kvcoder = useKvcoder();

const catalogSchema = z.record(z.string(), z.string());

function catalog(language: string): Record<string, string> {
  return catalogSchema.parse(JSON.parse(readFileSync(path.join(kvcoderFolder, 'locales', `${language}.json`), 'utf8')));
}

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1] ?? '').sort();
}

// Every literal `t('kvcoder.…')` in the components.
function webKeys(): string[] {
  const folder = path.join(kvcoderFolder, 'web', 'src');
  return readdirSync(folder).flatMap((file) => [...readFileSync(path.join(folder, file), 'utf8').matchAll(/t\('(kvcoder\.[\w.]+)'/g)].map((match) => match[1] ?? ''));
}

const codes = ['NAME_TAKEN', 'QUESTION_NOT_FOUND', 'SESSION_NOT_FOUND', 'SESSION_BUSY', 'JOB_NOT_FOUND'];
const notices = ['CANCELLED', 'INTERRUPTED', 'STEP_FAILED', 'MAX_STEPS', 'SUMMARY_FAILED', 'REPLY_LOST'];
const dynamic = [
  ...['idle', 'running', 'waiting'].map((status) => `kvcoder.ui.status.${status}`),
  ...['off', 'minimal', 'low', 'medium', 'high'].map((level) => `kvcoder.ui.thinkingLevels.${level}`),
  ...['global', 'workspace', 'session'].map((reach) => `kvcoder.ui.reach.${reach}`),
  ...['markdown', 'html'].map((format) => `kvcoder.ui.artifacts.format.${format}`),
  'kvcoder.ui.today',
  'kvcoder.ui.earlier',
];

describe("kvcoder's catalogs (02 §2.11)", { timeout: 30_000 }, () => {
  it('M2.4-E61 en and ar have the same keys, covering descriptions, errors, notices, the welcome, the pages, and every UI text', async () => {
    const en = catalog('en');
    const ar = catalog('ar');
    expect(Object.keys(ar).sort()).toEqual(Object.keys(en).sort());
    expect(Object.keys(en).filter((key) => !key.startsWith('kvcoder.'))).toEqual([]);
    for (const key of Object.keys(en)) expect(placeholders(ar[key] ?? ''), key).toEqual(placeholders(en[key] ?? ''));
    const { kernel } = await kvcoder.start();
    const info = (await kernel.exec('kernel.extensions.list', {})).find((extension) => extension.name === '@kvman/kvcoder');
    const needed = [
      ...[...(info?.commands ?? []), ...(info?.queries ?? [])].map((call) => `${call.name}.description`),
      ...(info?.settings ?? []).map((setting) => `${setting.key}.description`),
      ...codes.map((code) => `kvcoder.errors.${code}`),
      ...notices.map((code) => `kvcoder.notices.${code}`),
      'kvcoder.welcome.title',
      'kvcoder.ui.welcomeChat',
      'kvcoder.welcome.default',
      'kvcoder.pages.chat',
      'kvcoder.pages.session',
      'kvcoder.status.waiting',
      'kvcoder.markdown',
      'kvcoder.app.title',
      ...dynamic,
      ...webKeys(),
    ];
    expect(needed).toContain('kvcoder.ui.newChat');
    expect(needed.filter((key) => en[key] === undefined)).toEqual([]);
  });

  it('QA10-E9 en and ar have the recovery texts, and the job list keeps its exit-code text', () => {
    for (const language of ['en', 'ar'] as const) {
      const texts = catalog(language);
      for (const key of ['kvcoder.ui.retry', 'kvcoder.ui.chooseAnotherModel', 'kvcoder.ui.continueText', 'kvcoder.ui.exitCode']) expect(texts[key], `${language} ${key}`).toBeTypeOf('string');
    }
  });

  it('QA12-E7 en and ar have the artifact panel texts: View, Preview, Source, the URL format, Open in a new tab, and the refusal line', () => {
    for (const language of ['en', 'ar'] as const) {
      const texts = catalog(language);
      for (const key of ['kvcoder.ui.artifacts.view', 'kvcoder.ui.artifacts.preview', 'kvcoder.ui.artifacts.source', 'kvcoder.ui.artifacts.format.url', 'kvcoder.ui.artifacts.openUrl', 'kvcoder.ui.artifacts.urlRefused']) expect(texts[key], `${language} ${key}`).toBeTypeOf('string');
    }
  });

  it('QA20-E8 the welcome setting has its own title, apart from the welcome chat', () => {
    expect(catalog('en')['kvcoder.welcome.title']).toBe('Welcome note');
    for (const language of ['en', 'ar'] as const) expect(catalog(language)['kvcoder.ui.welcomeChat'], language).toBeTypeOf('string');
    expect(catalog('en')['kvcoder.ui.welcomeChat']).toBe('Welcome to kvman Coder');
  });

  it("QA20-E9 every choice of kvcoder's settings has a name in both languages", () => {
    const keys = [...['off', 'minimal', 'low', 'medium', 'high'].map((level) => `kvcoder.thinking.options.${level}`), ...['auto', 'ask'].map((mode) => `kvcoder.shell.approval.options.${mode}`)];
    for (const language of ['en', 'ar'] as const) expect(keys.filter((key) => catalog(language)[key] === undefined), language).toEqual([]);
  });
});
