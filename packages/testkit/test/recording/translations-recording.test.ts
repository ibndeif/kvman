import { describe, expect, it } from 'vitest';
import { correlationId, issuePaths, record, recordingProblem } from './harness.ts';

const catalogs = { en: { files: { title: 'Files' } }, ar: { files: { title: 'الملفات' } } };

describe('recording translations (plan 05 §5.3)', () => {
  it('M2.11-E1 registerTranslations records its value once, parses it, and defaults to null', () => {
    const { manifest } = record((ext) => {
      ext.registerTranslations({ default: 'en', catalogs });
    });
    expect(manifest.translations).toEqual({ default: 'en', catalogs });

    const repeated = recordingProblem((ext) => {
      ext.registerTranslations({ default: 'en', catalogs });
      ext.registerTranslations({ default: 'en', catalogs });
    });
    expect(repeated).toMatchObject({ code: 'EXT_MANIFEST_INVALID', correlationId });
    expect(issuePaths(repeated)).toEqual(['translations']);

    const dotted = recordingProblem((ext) => {
      ext.registerTranslations({ default: 'en', catalogs: { en: { 'a.b': 'Files' } } });
    });
    expect(dotted.code).toBe('EXT_MANIFEST_INVALID');
    expect(issuePaths(dotted)).toEqual(['translations.catalogs.en.a.b']);
    const [dottedIssue] = dotted.issues ?? [];
    expect(dottedIssue?.message).toContain('nest objects');

    const { manifest: without } = record(() => undefined);
    expect(without.translations).toBeNull();
  });
});
