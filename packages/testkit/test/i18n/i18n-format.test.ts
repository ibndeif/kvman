import { afterEach, describe, expect, it } from 'vitest';
import { workspaceA, workspaceB } from '../hosts/harness.ts';
import { command, person, problemOf, type InstallFixture } from '../install/harness.ts';
import { enable, grantsOf, valueOf } from '../workspaces/harness.ts';
import { i18nTests, lingoName, muteName, openLingoFixture, setLocale } from './harness.ts';

let fixture: InstallFixture | undefined;

afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

async function say(current: InstallFixture, key: string, params?: Record<string, string | number | boolean | null>): Promise<unknown> {
  return valueOf(await command(current, 'lingo.say', { key, ...(params === undefined ? {} : { params }) }, person, workspaceA));
}

describe('ctx.i18n.t formatting in a sandboxed host', i18nTests, () => {
  it('M2.11-E41 formats exact, base, default, and numbering-system locale fallbacks', async () => {
    fixture = await openLingoFixture();
    valueOf(await enable(fixture, workspaceA, lingoName, grantsOf(fixture, lingoName)));
    const cases = [
      { locale: 'en', greeting: 'Hello Sara', files: '3 files' },
      { locale: 'ar-u-nu-arab', greeting: 'مرحبا Sara', files: '٣ ملفات' },
      { locale: 'ar-u-nu-latn', greeting: 'مرحبا Sara', files: '3 ملفات' },
      { locale: 'ar-EG', greeting: 'مرحبا Sara', files: '٣ ملفات' },
      { locale: 'fr', greeting: 'Hello Sara', files: '3 files' },
    ];
    for (const testCase of cases) {
      await setLocale(fixture, testCase.locale);
      expect(await say(fixture, 'greeting', { name: 'Sara' })).toEqual({ text: testCase.greeting });
      expect(await say(fixture, 'files', { count: 3 })).toEqual({ text: testCase.files });
    }
    await setLocale(fixture, 'ar-u-nu-arab');
    expect(await say(fixture, 'only-en')).toEqual({ text: 'English only' });
  });

  it('M2.11-E42 rejects missing keys and invalid parameters while treating tags as text', async () => {
    fixture = await openLingoFixture();
    valueOf(await enable(fixture, workspaceA, lingoName, grantsOf(fixture, lingoName)));
    valueOf(await enable(fixture, workspaceB, muteName, grantsOf(fixture, muteName)));

    const missingKey = problemOf(await command(fixture, 'lingo.say', { key: 'nope' }, person, workspaceA));
    expect(missingKey).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(missingKey.detail).toContain('nope');
    const missingParameter = problemOf(await command(fixture, 'lingo.say', { key: 'greeting' }, person, workspaceA));
    expect(missingParameter).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(missingParameter.detail).toContain('greeting');
    expect(missingParameter.detail).toContain('name');
    const objectParameter = problemOf(await command(fixture, 'lingo.say', { key: 'greeting', params: { name: { a: 1 } } }, person, workspaceA));
    expect(objectParameter).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(objectParameter.detail).toContain('greeting');
    expect(objectParameter.detail).toContain('name');
    expect(await say(fixture, 'bold')).toEqual({ text: 'Click <b>here</b>' });
    const mute = problemOf(await command(fixture, 'mute.say', { key: 'greeting' }, person, workspaceB));
    expect(mute).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(mute.detail).toContain('greeting');
  });
});
