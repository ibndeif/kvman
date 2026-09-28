import { readAppliedPreset, writeAppliedPreset } from '@kvman/kernel';
import { jsonSchema, presetSchema, validateResultSchema } from '@kvman/protocol';
import { afterEach, describe, expect, it } from 'vitest';
import { workspaceA } from '../hosts/harness.ts';
import { command, openInstallFixture, problemOf, type InstallFixture } from '../install/harness.ts';
import { query } from '../workspaces/harness.ts';
import { presetTests, stageApply, updatePreset } from './harness.ts';

let fixture: InstallFixture | undefined;
const help = {
  presetVersion: 1, id: 'help', name: 'Help', revision: 1, app: { title: 'Help', home: '/help' }, extensions: {},
  pages: [{ name: 'help', description: 'Help.', route: '/help', title: '$t.help.title', view: { type: 'text', text: '$t.help.body' } }],
  translations: { default: 'en', catalogs: { en: { help: { title: 'Help', body: 'Read me', count: '{count} items' }, labels: { top: 'Top' } } } },
};

function validation(answer: unknown): ReturnType<typeof validateResultSchema.parse> {
  if (typeof answer !== 'object' || answer === null || !('ok' in answer) || answer.ok !== true || !('value' in answer)) throw new Error('kernel.validate did not answer');
  return validateResultSchema.parse(answer.value);
}

afterEach(async () => { await fixture?.close(); fixture = undefined; });

describe('preset catalog text rules', presetTests, () => {
  it('M2.11-E15 import preview refuses missing keys, invalid ICU, missing default, and unpassed parameters', async () => {
    fixture = await openInstallFixture();
    const cases: Array<[object, string, string]> = [
      [{ ...help, pages: [{ ...help.pages[0], title: '$t.help.missing' }] }, 'pages.0.title', 'help.missing'],
      [{ ...help, translations: { ...help.translations, catalogs: { en: { help: { title: 'Help', body: '{oops' } } } } }, 'translations.catalogs.en.help.body', 'not valid ICU'],
      [{ ...help, translations: { ...help.translations, default: 'fr' } }, 'translations.default', 'default locale fr'],
      [{ ...help, nav: [{ name: 'top', description: 'Top.', page: 'preset.help', label: '$t.help.count', icon: 'home' }] }, 'nav.0.label', 'uses {count}'],
    ];
    for (const [preset, path, message] of cases) {
      const reply = await query(fixture, 'kernel.preset.import.preview', { json: jsonSchema.parse(preset) });
      expect(reply).toMatchObject({ ok: false, problem: { code: 'PRESET_INVALID', issues: [expect.objectContaining({ path, message: expect.stringContaining(message) })] } });
    }
  });

  it('M2.11-E16 update rejects missing keys and invalid ICU without changing revision, then accepts a known key', async () => {
    fixture = await openInstallFixture();
    writeAppliedPreset(fixture.connection, workspaceA, presetSchema.parse(help), fixture.timers.time.value);
    fixture.runtime.registry.refresh();
    const first = problemOf(await updatePreset(fixture, workspaceA, { labels: { 'board.nav-top': '$t.labels.missing' } }, 1));
    expect(first).toMatchObject({ code: 'PRESET_INVALID', issues: [expect.objectContaining({ path: 'labels.board.nav-top', message: expect.stringContaining('labels.missing') })] });
    const second = problemOf(await updatePreset(fixture, workspaceA, { translations: { default: 'en', catalogs: { en: { help: { title: 'Help', body: '{oops' } } } } }, 1));
    expect(second).toMatchObject({ code: 'PRESET_INVALID', issues: [expect.objectContaining({ path: 'translations.catalogs.en.help.body', message: expect.stringContaining('not valid ICU') })] });
    expect(readAppliedPreset({ connection: fixture.connection }, workspaceA)?.revision).toBe(1);
    expect(await updatePreset(fixture, workspaceA, { labels: { 'board.nav-top': '$t.help.title' } }, 1)).toMatchObject({ ok: true, value: { revision: 2 } });
    expect(readAppliedPreset({ connection: fixture.connection }, workspaceA)?.preset.labels).toEqual({ 'board.nav-top': '$t.help.title' });
  });

  it('M2.11-E17 validate and JSON apply stage refuse missing keys; literal preset text validates and saves', async () => {
    fixture = await openInstallFixture();
    const missing = { ...help, pages: [{ ...help.pages[0], title: '$t.help.missing' }] };
    const checked = validation(await query(fixture, 'kernel.validate', { preset: missing }));
    expect(checked).toMatchObject({ ok: false, issues: [expect.objectContaining({ path: 'pages.0.title', message: expect.stringContaining('help.missing') })] });
    expect(problemOf(await stageApply(fixture, workspaceA, { json: jsonSchema.parse(missing) })))
      .toMatchObject({ code: 'PRESET_INVALID', issues: [expect.objectContaining({ path: 'pages.0.title' })] });
    const literal = { ...help, app: { ...help.app, title: 'Literal title' }, labels: { 'board.nav-top': 'Top' } };
    expect(validation(await query(fixture, 'kernel.validate', { preset: literal }))).toEqual({ ok: true, issues: [] });
    writeAppliedPreset(fixture.connection, workspaceA, presetSchema.parse(literal), fixture.timers.time.value);
    fixture.runtime.registry.refresh();
    expect(await command(fixture, 'kernel.preset.save', { workspaceId: workspaceA, name: 'Saved Help' })).toMatchObject({ ok: true, value: { presetId: expect.any(String) } });
  });
});
