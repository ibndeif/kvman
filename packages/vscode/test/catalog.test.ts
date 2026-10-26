import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { hintKey, languageOf, translator } from '../src/catalog.ts';

const read = (file: string): Record<string, string> => JSON.parse(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'));
const placeholders = (text: string): string[] => [...text.matchAll(/\{[a-z]+\}/g)].map((match) => match[0]).sort();

describe("the extension's text (15 §15.7, ADR 0099, 30)", () => {
  it("M4.2-H17 VS Code's language chooses Arabic for ar, and English for any other", () => {
    expect(['ar', 'ar-EG', 'en', 'de', 'en-US', 'arx'].map(languageOf)).toEqual(['ar', 'ar', 'en', 'en', 'en', 'en']);
    expect(translator('ar')('vscode.stopped')).toBe('توقف kvman على نحو غير متوقع.');
    expect(translator('en')('vscode.tooOld', { version: '0.3.9', minimum: '0.4.7' })).toBe('kvman 0.3.9 is older than this extension needs (0.4.7).');
  });

  it('M4.2-H17 M4.6-H7 M4.8-E8 en and ar have the same keys and placeholders, and so do the manifest texts', () => {
    expect(Object.keys(read('locales/ar.json'))).toEqual(expect.arrayContaining(['vscode.oldRunning', 'vscode.openAnyway']));
    for (const [english, arabic] of [['locales/en.json', 'locales/ar.json'], ['static/package.nls.json', 'static/package.nls.ar.json']] as const) {
      const [en, ar] = [read(english), read(arabic)];
      expect(Object.keys(ar).sort()).toEqual(Object.keys(en).sort());
      for (const [key, text] of Object.entries(en)) {
        expect(ar[key]?.trim(), key).not.toBe('');
        expect(placeholders(ar[key] ?? ''), key).toEqual(placeholders(text));
        expect(ar[key], key).toMatch(/[؀-ۿ]/u);
      }
    }
    const manifest = readFileSync(new URL('../manifest.json', import.meta.url), 'utf8');
    const named = [...manifest.matchAll(/"%([^%]+)%"/g)].map((match) => match[1]).sort();
    expect(named).toEqual(Object.keys(read('static/package.nls.json')).sort());
  });

  it('M4.2-H9 a failed code has its hint, and any other code the log', () => {
    expect(['KVMAN_RUNNING', 'PORT_IN_USE', 'EXTENSION_INVALID', 'VALIDATION_FAILED', 'INTERNAL', 'toString'].map(hintKey)).toEqual([
      'vscode.failed.hint.KVMAN_RUNNING',
      'vscode.failed.hint.PORT_IN_USE',
      'vscode.failed.hint.EXTENSION_INVALID',
      'vscode.failed.hint.VALIDATION_FAILED',
      'vscode.failed.hint.other',
      'vscode.failed.hint.other',
    ]);
  });
});
