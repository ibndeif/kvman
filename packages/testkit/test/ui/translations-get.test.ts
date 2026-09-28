import { afterEach, describe, expect, it } from 'vitest';
import { workspaceA } from '../hosts/harness.ts';
import { enable, valueOf } from '../workspaces/harness.ts';
import { boardFixture, locale, translations } from './registry-harness.ts';
import { boardCatalogs } from './fixtures/extensions/board-common.ts';
import { helpCatalogs, helpPreset } from './registry-preset.ts';
import { uiTests, type UiFixture } from './harness.ts';

let fixture: UiFixture | undefined;
afterEach(async () => { await fixture?.close(); fixture = undefined; });

describe('translation catalogs', uiTests, () => {
  it('M2.11-E30 returns saved locale and only shipped fallbacks per owner', async () => {
    fixture = await boardFixture(['board', 'kit']);
    valueOf(await enable(fixture, workspaceA, '@acme/kit'));
    await helpPreset(fixture);
    for (const language of ['ar-EG', 'ar-u-nu-latn']) {
      await locale(fixture, language);
      expect(await translations(fixture)).toEqual({ locale: language, catalogs: { '@acme/board': { ar: boardCatalogs.ar, en: boardCatalogs.en }, preset: { ar: helpCatalogs.ar, en: helpCatalogs.en } } });
    }
    for (const language of ['fr', 'en']) {
      await locale(fixture, language);
      expect(await translations(fixture)).toEqual({ locale: language, catalogs: { '@acme/board': { en: boardCatalogs.en }, preset: { en: helpCatalogs.en } } });
    }
  });
});
