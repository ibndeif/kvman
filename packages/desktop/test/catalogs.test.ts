import { describe, expect, it } from 'vitest';
import { readCatalog } from './support.ts';

const placeholders = (text: string): string[] => [...text.matchAll(/\{[a-z]+\}/g)].map((match) => match[0]).sort();

describe("the shell's catalogs (14 §14.9)", () => {
  it('M3.2-E22 en and ar have the same keys under desktop., no empty text, and the same placeholders', () => {
    const english = readCatalog('en');
    const arabic = readCatalog('ar');
    expect(Object.keys(arabic)).toEqual(Object.keys(english));
    expect(Object.keys(english).length).toBeGreaterThan(15);
    expect(Object.keys(english).filter((key) => !key.startsWith('desktop.'))).toEqual([]);
    for (const [key, text] of Object.entries(english)) {
      expect(text.trim(), key).not.toBe('');
      expect(arabic[key]?.trim(), key).not.toBe('');
      expect(placeholders(arabic[key] ?? ''), key).toEqual(placeholders(text));
      if (!key.endsWith('.openFolder')) expect(arabic[key], key).toMatch(/[؀-ۿ]/u);
    }
  });
});
