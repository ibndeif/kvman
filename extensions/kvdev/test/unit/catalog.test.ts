import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import { kvdevCodes } from '../../src/problems.ts';

const catalog = (language: string) => z.record(z.string(), z.string()).parse(JSON.parse(readFileSync(new URL(`../../locales/${language}.json`, import.meta.url), 'utf8')));

describe("kvdev's catalogs (02 §2.11, ADR 0009, 126)", () => {
  it('M2.5-E36 every error code, kvdev.title, and kvdev.app.title have en and ar texts, and both catalogs have the same keys', () => {
    const [en, ar] = [catalog('en'), catalog('ar')];
    for (const key of ['kvdev.title', 'kvdev.app.title', ...kvdevCodes.map((code) => `kvdev.errors.${code}`)]) {
      expect(en[key], key).toEqual(expect.any(String));
      expect(ar[key], key).toEqual(expect.any(String));
    }
    expect(Object.keys(ar).sort()).toEqual(Object.keys(en).sort());
    expect(en['kvdev.app.title']).toBe('kvman Dev');
  });
});
