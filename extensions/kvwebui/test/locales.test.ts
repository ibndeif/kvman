import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';

const root = fileURLToPath(new URL('..', import.meta.url));
const catalogSchema = z.record(z.string(), z.string());

function catalog(language: string): Record<string, string> {
  return catalogSchema.parse(JSON.parse(readFileSync(path.join(root, 'locales', `${language}.json`), 'utf8')));
}

function sources(folder: string): string[] {
  return readdirSync(folder).flatMap((name) => {
    const file = path.join(folder, name);
    return statSync(file).isDirectory() ? sources(file) : /\.(ts|vue)$/.test(name) ? [readFileSync(file, 'utf8')] : [];
  });
}

const placeholders = (text: string): string[] => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1] ?? '').sort();

// Names under `kvwebui.` that aren't texts: setting keys, page ids, what a tab remembers, and the commands the app calls.
const notTexts = new Set(['kvwebui.home', 'kvwebui.nav.order', 'kvwebui.nav.hidden', 'kvwebui.theme', 'kvwebui.settings', 'kvwebui.extensions', 'kvwebui.workspace', 'kvwebui.panel', 'kvwebui.nav.collapsed', 'kvwebui.effect.take']);
// The keys the sources build from a template.
const built = ['global', 'workspace'].flatMap((scope) => [`kvwebui.settings.reset.${scope}`, `kvwebui.settings.scope.${scope}`, `kvwebui.settings.source.${scope}`, `kvwebui.settings.changed.${scope}`]);
const themes = ['system', 'light', 'dark'].map((theme) => `kvwebui.theme.${theme}`);

describe("kvwebui's catalogs (02 §2.11)", () => {
  it('M2.2-E17 en and ar have the same keys and placeholders, covering every text the app names and its settings', () => {
    const en = catalog('en');
    const ar = catalog('ar');
    expect(Object.keys(ar).sort()).toEqual(Object.keys(en).sort());
    expect(Object.keys(en).filter((key) => !key.startsWith('kvwebui.'))).toEqual([]);
    for (const key of Object.keys(en)) expect(placeholders(ar[key] ?? ''), key).toEqual(placeholders(en[key] ?? ''));
    const named = sources(path.join(root, 'web', 'src')).flatMap((source) => [...source.matchAll(/['"`](kvwebui\.[a-zA-Z.]+[a-zA-Z])['"`]/g)].map((match) => match[1] ?? ''));
    const texts = [...new Set([...named.filter((key) => !notTexts.has(key)), ...built, ...themes, 'kvwebui.settings.source.default', 'kvwebui.errors.OFFLINE'])];
    expect(texts.length).toBeGreaterThan(50);
    expect(texts.filter((key) => en[key] === undefined)).toEqual([]);
    const settingKeys = ['kvwebui.title', 'kvwebui.home', 'kvwebui.nav.order', 'kvwebui.nav.hidden', 'kvwebui.theme'];
    expect(settingKeys.flatMap((key) => [`${key}.title`, `${key}.description`]).filter((key) => en[key] === undefined)).toEqual([]);
  });

  it('QA13-E9 en and ar have the folder browser texts', () => {
    for (const language of ['en', 'ar']) {
      const texts = catalog(language);
      for (const key of ['kvwebui.workspace.openThis', 'kvwebui.workspace.up', 'kvwebui.workspace.showHidden', 'kvwebui.workspace.noFolders', 'kvwebui.workspace.truncated', 'kvwebui.workspace.folderHelp']) expect(texts[key], `${language} ${key}`).toBeTypeOf('string');
    }
  });

  it('QA14-E10 en and ar have the folder browser texts of the places, the filter, Back, and New folder', () => {
    for (const language of ['en', 'ar']) {
      const texts = catalog(language);
      for (const key of ['places', 'back', 'filter', 'noMatch', 'alreadyOpen', 'newFolder', 'newFolderName', 'create', 'pathLabel']) expect(texts[`kvwebui.workspace.${key}`], `${language} ${key}`).toBeTypeOf('string');
    }
  });

  it("QA20-E9 every choice of kvwebui's theme has a name in both languages", () => {
    for (const language of ['en', 'ar']) {
      const texts = catalog(language);
      for (const theme of ['system', 'light', 'dark']) expect(texts[`kvwebui.theme.options.${theme}`], `${language} ${theme}`).toBeTypeOf('string');
    }
  });
});
