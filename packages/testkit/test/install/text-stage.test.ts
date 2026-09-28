import { jsonObjectSchema, validateResultSchema, type Json } from '@kvman/protocol';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { pdfManifest, setAt } from '../validation/harness.ts';
import { query } from '../workspaces/harness.ts';
import { command, installTests, openInstallFixture, problemOf, staged, type InstallFixture } from './harness.ts';
import { extensionSource, packPackage, writePackage } from './packages.ts';
import { startRegistry, type LocalRegistry } from './registries.ts';

let registry: LocalRegistry;
let fixture: InstallFixture | undefined;

beforeAll(async () => {
  registry = await startRegistry();
  for (const [name, title, catalogs] of [
    ['missing', '$t.page.missing', `{ default: 'en', catalogs: { en: { meta: { title: 'Board' } } } }`],
    ['literal', 'Literal page', `{ default: 'en', catalogs: { en: { meta: { title: 'Board' } } } }`],
    ['board', '$t.page.title', `{ default: 'en', catalogs: { en: { meta: { title: 'Board' }, page: { title: 'Board page' } }, ar: { meta: { title: 'لوحة' }, page: { title: 'صفحة' } } } }`],
  ]) {
    const source = extensionSource(`@acme/${name}`, name ?? '', `const translations = ${catalogs};`)
      .replace("title: 'Sample'", "title: '$t.meta.title'")
      .replace(`  ext.registerCommand`, `  ext.registerTranslations(translations);\n  ext.registerPage('${name}.home', { description: 'Home.', route: '/${name}', title: '${title}', view: { type: 'stack' } });\n  ext.registerCommand`);
    await registry.publish(await packPackage(writePackage({ name: `@acme/${name}`, files: { 'dist/extension.js': source } })));
  }
});
afterAll(async () => { await registry.close(); });
afterEach(async () => { await fixture?.close(); fixture = undefined; });

describe('text at staging and kernel.validate', installTests, () => {
  it('M2.11-E12 sandbox staging refuses missing keys, warns on literals, and loads ICU for Board', async () => {
    fixture = await openInstallFixture({ registry: registry.url });
    const failure = problemOf(await command(fixture, 'kernel.extension.stage', { source: 'npm:@acme/missing@1.0.0' }));
    expect(failure).toMatchObject({ code: 'EXT_MANIFEST_INVALID', issues: [expect.objectContaining({ path: 'ui.pages.0.title', message: expect.stringContaining('page.missing') })] });
    const literal = await staged(fixture, 'npm:@acme/literal@1.0.0');
    expect(literal.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'ui.pages.0.title', severity: 'warning', message: expect.stringContaining('literal') })]));
    const board = await staged(fixture, 'npm:@acme/board@1.0.0');
    expect(board.warnings).toEqual([]);
  });

  it('M2.11-E13 kernel.validate manifest distinguishes missing keys from literal warnings', async () => {
    fixture = await openInstallFixture();
    const missing = pdfManifest((manifest) => setAt(manifest, ['ui', 'pages', 0, 'title'], '$t.files.missing'));
    const invalid = await query(fixture, 'kernel.validate', { manifest: missing });
    expect(invalid).toMatchObject({ ok: true, value: { ok: false, issues: [expect.objectContaining({ path: 'ui.pages.0.title', message: expect.stringContaining('files.missing') })] } });
    const literal = pdfManifest((manifest) => setAt(manifest, ['ui', 'pages', 0, 'title'], 'Literal page'));
    const answer = await query(fixture, 'kernel.validate', { manifest: literal });
    expect(answer).toMatchObject({ ok: true, value: { ok: true, issues: [expect.objectContaining({ path: 'ui.pages.0.title', severity: 'warning' })] } });
  });

  it('M2.11-E14 stage result carries the Arabic title catalog', async () => {
    fixture = await openInstallFixture({ registry: registry.url });
    const board = await staged(fixture, 'npm:@acme/board@1.0.0');
    expect(board.translations?.['ar']).toMatchObject({ title: 'لوحة' });
  });

  it('M2.11-E50 validates a single catalog independently of workspace, including shape and ICU', async () => {
    fixture = await openInstallFixture();
    const good = { files: { title: 'Files', count: '{count, plural, one {# file} other {# files}}' } };
    const validate = async (catalog: Json, workspaceId?: string) => {
      const reply = await query(fixture!, 'kernel.validate', { catalog, ...(workspaceId === undefined ? {} : { workspaceId }) });
      if (typeof reply !== 'object' || reply === null || !('ok' in reply) || reply.ok !== true || !('value' in reply)) throw new Error('kernel.validate did not answer');
      return validateResultSchema.parse(jsonObjectSchema.parse(reply.value));
    };
    expect(await validate(good)).toEqual({ ok: true, issues: [] });
    expect(await validate(good, 'a'.repeat(64))).toEqual({ ok: true, issues: [] });
    const cases: Array<[Json, string, string]> = [
      [{ 'a.b': 'No dots' }, 'catalog.a.b', 'Invalid key'],
      [{ files: { count: '{count, plural, one {# file}' } }, 'catalog.files.count', 'not valid ICU'],
      [{ files: { count: 2 } }, 'catalog.files.count', 'string'],
    ];
    for (const [catalog, path, message] of cases) {
      const result = await validate(catalog);
      expect(result.ok).toBe(false);
      expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({ path, message: expect.stringContaining(message) })]));
    }
  });
});
