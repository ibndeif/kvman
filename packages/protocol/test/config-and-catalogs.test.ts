import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { blobIdSchema, catalogSchema, configFieldMetaSchema, localeSchema } from '../src/index.ts';
import { expectRoundTrip, issuePaths } from './assertions.ts';

describe('config meta, catalogs, blob ids (plan 05 §5.8, 08 §8.16, ADR 0018)', () => {
  it('M0.3-E20 config field meta', () => {
    expectRoundTrip(configFieldMetaSchema, {
      label: '$t.settings.apiKey', help: { $t: 'settings.apiKeyHelp', provider: 'Anthropic' }, secret: true,
      ui: { widget: 'secret', group: '$t.settings.credentials', order: 1 },
    });
    expect(issuePaths(configFieldMetaSchema, { ui: { widget: 'slider' } })).toEqual(['ui.widget']);
  });

  it('M0.3-E21 catalogs and locales', () => {
    expectRoundTrip(catalogSchema, { meta: { title: 'PDF Translator' }, problems: { NOT_FOUND: 'Gone.' } });
    expect(issuePaths(catalogSchema, { files: { count: 3 } })).toEqual(['files']);
    expect(issuePaths(catalogSchema, { 'files.title': 'Files' })).toEqual(['files.title']);
    expect(localeSchema.safeParse('EN').success).toBe(false);
    expect(localeSchema.safeParse('ar-u-nu-latn').success).toBe(true);
  });

  it('M0.3-E22 blob ids are 64 lowercase hex characters marked kvman-blob-id', () => {
    expect(blobIdSchema.safeParse('d'.repeat(64)).success).toBe(true);
    expect(blobIdSchema.safeParse('D'.repeat(64)).success).toBe(false);
    expect(blobIdSchema.safeParse('d'.repeat(63)).success).toBe(false);
    expect(z.toJSONSchema(blobIdSchema)).toMatchObject({ type: 'string', format: 'kvman-blob-id', pattern: '^[0-9a-f]{64}$' });
  });
});
