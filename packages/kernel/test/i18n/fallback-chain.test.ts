import { describe, expect, it } from 'vitest';
import { fallbackChain } from '../../src/i18n/catalogs.ts';

describe('catalog fallback', () => {
  it('M2.11-E45 uses only shipped exact, base, and default locales without repeats', () => {
    const translations = { default: 'en', catalogs: { en: {}, ar: {}, 'ar-EG': {} } };
    expect(fallbackChain(translations, 'ar-EG')).toEqual(['ar-EG', 'ar', 'en']);
    expect(fallbackChain(translations, 'ar-u-nu-latn')).toEqual(['ar', 'en']);
    expect(fallbackChain(translations, 'ar')).toEqual(['ar', 'en']);
    expect(fallbackChain(translations, 'fr')).toEqual(['en']);
    expect(fallbackChain(translations, 'en')).toEqual(['en']);
  });
});
