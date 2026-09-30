import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { kernelCommandSchemas, kernelProblemCodes, kernelQuerySchemas } from '@kvman/sdk';
import { kernelCatalogOwner, mergeCatalogs, readOwnerCatalogs } from '../../src/localization/catalogs.ts';
import { kernelSettingDefinitions } from '../../src/settings/kernel-settings.ts';

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

function extensionWith(catalogs: Record<string, Record<string, string>>) {
  const folder = mkdtempSync(path.join(tmpdir(), 'kvman-catalogs-'));
  folders.push(folder);
  mkdirSync(path.join(folder, 'locales'));
  for (const [language, catalog] of Object.entries(catalogs)) writeFileSync(path.join(folder, 'locales', `${language}.json`), JSON.stringify(catalog));
  return readOwnerCatalogs({ name: '@test/l', namespace: 'l', folder });
}

describe('catalogs (02 §2.11)', () => {
  it('M1.6-H11 a key missing in fr falls back to en; a key in no catalog is left to the UI', () => {
    const catalogs = mergeCatalogs([readOwnerCatalogs(kernelCatalogOwner), extensionWith({ en: { 'l.hello': 'Hello', 'l.bye': 'Bye' }, fr: { 'l.hello': 'Bonjour' } })]);
    const french = catalogs.catalog('fr');
    expect(french['l.hello']).toBe('Bonjour');
    expect(french['l.bye']).toBe('Bye');
    expect(french['kernel.errors.NOT_FOUND']).toBe(catalogs.catalog('en')['kernel.errors.NOT_FOUND']);
    expect(Object.hasOwn(french, 'l.missing')).toBe(false);
  });

  it('M1.6-E20 a language no catalog has is NOT_FOUND', () => {
    const catalogs = mergeCatalogs([readOwnerCatalogs(kernelCatalogOwner)]);
    expect(() => catalogs.catalog('de')).toThrow(expect.objectContaining({ problem: expect.objectContaining({ code: 'NOT_FOUND' }) }));
  });

  it('M1.6-E21 the kernel\'s en and ar catalogs have the same keys, with every error, name, and setting', () => {
    const kernel = readOwnerCatalogs(kernelCatalogOwner);
    const english = Object.keys(kernel.get('en') ?? {}).sort();
    expect(Object.keys(kernel.get('ar') ?? {}).sort()).toEqual(english);
    const names = [...Object.keys(kernelCommandSchemas), ...Object.keys(kernelQuerySchemas), ...kernelSettingDefinitions(['en']).map((setting) => setting.key)];
    const required = [...kernelProblemCodes.map((code) => `kernel.errors.${code}`), ...names.map((name) => `${name}.description`)];
    expect(required.filter((key) => !english.includes(key))).toEqual([]);
  });
});
