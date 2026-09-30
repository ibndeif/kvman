import { describe, expect, it } from 'vitest';
import { entry, useHarness, type TestExtension } from '../extension-folders.ts';

const harness = useHarness();

const translated = (files: Record<string, string>): TestExtension => ({ name: '@test/l', namespace: 'l', entry: entry(''), files });
const catalogs = { 'locales/en.json': JSON.stringify({ 'l.hello': 'Hello', 'l.bye': 'Bye' }), 'locales/fr.json': JSON.stringify({ 'l.hello': 'Bonjour' }) };

describe('the language (02 §2.11)', () => {
  it('M1.6-H11 an extension\'s fr catalog makes fr selectable', async () => {
    const kernel = await harness.start([translated(catalogs)]);
    expect((await kernel.exec('kernel.health.get', {})).languages).toEqual(['ar', 'en', 'fr']);
    await kernel.exec('kernel.settings.set', { key: 'kernel.language', value: 'fr', scope: 'global' });
    const language = (await kernel.exec('kernel.settings.list', {})).find((setting) => setting.key === 'kernel.language');
    expect(language).toMatchObject({ value: 'fr', source: 'global' });
  });

  it('M1.6-E22 a language no catalog has is refused', async () => {
    const kernel = await harness.start([translated(catalogs)]);
    await expect(kernel.exec('kernel.settings.set', { key: 'kernel.language', value: 'de', scope: 'global' })).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
  });

  it('M1.6-E19 a catalog that is not JSON, has a non-string value, or a key outside the namespace fails the load', async () => {
    const broken = ['{ not json', JSON.stringify({ 'l.count': 3 }), JSON.stringify({ 'other.hello': 'Hi' })];
    for (const text of broken) {
      await expect(harness.start([translated({ 'locales/fr.json': text })])).rejects.toMatchObject({
        problem: { code: 'EXTENSION_INVALID', message: expect.stringContaining('@test/l: locales/fr.json') },
      });
    }
  });
});
