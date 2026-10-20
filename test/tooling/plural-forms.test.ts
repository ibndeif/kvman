import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Plural forms (plan 02 §2.11, ADR 0098, 1): a text with `|` has one form per plural category of its language. The
// desktop app's catalogs are read by the desktop shell, which doesn't choose forms, so they hold none.
const root = fileURLToPath(new URL('../..', import.meta.url));
const readByKvwebui = ['packages/kernel', 'extensions/kvai', 'extensions/kvwebui', 'extensions/kvcoder', 'extensions/kvbuilder'];
const categoryOrder: readonly Intl.LDMLPluralRule[] = ['zero', 'one', 'two', 'few', 'many', 'other'];

function texts(owner: string): { language: string; key: string; text: string }[] {
  return readdirSync(`${root}/${owner}/locales`)
    .filter((file) => file.endsWith('.json'))
    .flatMap((file) => {
      const language = file.slice(0, -'.json'.length);
      const catalog: unknown = JSON.parse(readFileSync(`${root}/${owner}/locales/${file}`, 'utf8'));
      return typeof catalog === 'object' && catalog !== null ? Object.entries(catalog).map(([key, text]) => ({ language, key, text: String(text) })) : [];
    });
}

const categoryCount = (language: string): number => categoryOrder.filter((category) => new Intl.PluralRules(language).resolvedOptions().pluralCategories.includes(category)).length;

describe('plural forms in the catalogs (ADR 0098, 1)', () => {
  it("QA66-E3 each plural text has its language's number of forms, and the desktop app's catalogs have none", () => {
    const plural = readByKvwebui.flatMap(texts).filter(({ text }) => text.includes('|'));
    expect(plural.length).toBeGreaterThan(40);
    const wrong = plural.filter(({ language, text }) => text.split('|').length !== categoryCount(language)).map(({ language, key }) => `${language} ${key}`);
    expect(wrong).toEqual([]);
    expect(texts('packages/desktop').filter(({ text }) => text.includes('|')).map(({ key }) => key)).toEqual([]);
  });
});
