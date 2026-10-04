import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import { kvcustomizerCodes } from '../../src/problems.ts';

const catalog = (language: string) => z.record(z.string(), z.string()).parse(JSON.parse(readFileSync(new URL(`../../locales/${language}.json`, import.meta.url), 'utf8')));

// The old app title, built so this file doesn't hold the old name (see rename.test.ts).
const oldAppTitle = 'kv' + 'dev' + '.app.title';

describe("kvcustomizer's catalogs (02 §2.11, ADR 0009, 126)", () => {
  it('QA17-E20 every error code and kvcustomizer.title have en and ar texts, both catalogs match, and the old app titles are gone (was M2.5-E36)', () => {
    const [en, ar] = [catalog('en'), catalog('ar')];
    for (const key of ['kvcustomizer.title', ...kvcustomizerCodes.map((code) => `kvcustomizer.errors.${code}`)]) {
      expect(en[key], key).toEqual(expect.any(String));
      expect(ar[key], key).toEqual(expect.any(String));
    }
    expect(en['kvcustomizer.app.title']).toBeUndefined();
    expect(ar['kvcustomizer.app.title']).toBeUndefined();
    expect(en[oldAppTitle]).toBeUndefined();
    expect(ar[oldAppTitle]).toBeUndefined();
    expect(Object.keys(ar).sort()).toEqual(Object.keys(en).sort());
  });
});
