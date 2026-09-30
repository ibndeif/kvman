import { describe, expect, it } from 'vitest';
import { z, type Json, type SettingScope } from '@kvman/sdk';
import { createSettings, type SettingDefinition } from '../../src/settings/settings.ts';
import { captureLog } from '../log-capture.ts';
import { useTemporaryHomes, type TestHome } from '../temporary-home.ts';

const newHome = useTemporaryHomes();

function definition(key: string, scopes: readonly SettingScope[], defaultValue?: unknown): SettingDefinition {
  return { key, extension: '@test/notes', description: 'A test setting.', schema: z.string(), defaultValue: defaultValue === undefined ? undefined : { value: defaultValue }, scopes };
}

function settingsOf(test: TestHome, presetValues: Record<string, Json> = {}) {
  const log = captureLog();
  const definitions = new Map([
    ['notes.greeting', definition('notes.greeting', ['global', 'workspace'], 'default')],
    ['notes.theme', definition('notes.theme', ['global'], 'light')],
    ['notes.home', definition('notes.home', [])],
  ]);
  return { settings: createSettings({ connection: test.connection, definitions, presetValues, logger: log.logger }), lines: log.lines };
}

describe('settings (02 §2.8)', () => {
  it('M1.3-H5 values resolve workspace, global, preset, default; scopes hold; stale values are skipped', () => {
    const test = newHome();
    const { settings, lines } = settingsOf(test, { 'notes.greeting': 'preset', 'notes.home': 'notes.page' });
    settings.set('notes.greeting', 'global', 'global', 'home');
    settings.set('notes.greeting', 'workspace', 'workspace', 'workspace-a');
    expect(settings.resolve('notes.greeting', 'workspace-a')).toEqual({ value: 'workspace', source: 'workspace' });
    expect(settings.resolve('notes.greeting', 'workspace-b')).toEqual({ value: 'global', source: 'global' });
    settings.reset('notes.greeting', 'workspace', 'workspace-a');
    settings.reset('notes.greeting', 'global', 'home');
    expect(settings.resolve('notes.greeting', 'workspace-a')).toEqual({ value: 'preset', source: 'preset' });
    expect(settingsOf(test).settings.resolve('notes.greeting', 'workspace-a')).toEqual({ value: 'default', source: 'default' });
    expect(() => settings.set('notes.theme', 'dark', 'workspace', 'workspace-a')).toThrow(expect.objectContaining({ problem: expect.objectContaining({ code: 'VALIDATION_FAILED' }) }));
    test.connection.prepare("INSERT INTO settings (key, scope, value) VALUES ('notes.greeting', 'workspace-a', '42')").run();
    expect(settings.resolve('notes.greeting', 'workspace-a')).toEqual({ value: 'preset', source: 'preset' });
    expect(lines.filter((line) => line.includes('no longer fits'))).toHaveLength(1);
  });

  it('M1.3-E10 a value that does not fit fails, and an unknown key is not found', () => {
    const { settings } = settingsOf(newHome());
    expect(() => settings.set('notes.greeting', 42, 'global', 'home')).toThrow(expect.objectContaining({ problem: expect.objectContaining({ code: 'VALIDATION_FAILED' }) }));
    expect(() => settings.resolve('notes.missing', 'home')).toThrow(expect.objectContaining({ problem: expect.objectContaining({ code: 'NOT_FOUND' }) }));
    expect(() => settings.set('notes.missing', 'x', 'global', 'home')).toThrow(expect.objectContaining({ problem: expect.objectContaining({ code: 'NOT_FOUND' }) }));
  });

  it('M1.3-E11 a preset-only key refuses both scopes, and its preset value resolves', () => {
    const { settings } = settingsOf(newHome(), { 'notes.home': 'notes.page' });
    for (const scope of ['global', 'workspace'] as const) {
      expect(() => settings.set('notes.home', 'other', scope, 'home')).toThrow(expect.objectContaining({ problem: expect.objectContaining({ code: 'VALIDATION_FAILED' }) }));
    }
    expect(settings.resolve('notes.home', 'home')).toEqual({ value: 'notes.page', source: 'preset' });
  });

  it('M1.3-E12 the stale-value warning names the key and scope, never the value', () => {
    const test = newHome();
    const { settings, lines } = settingsOf(test);
    test.connection.prepare(`INSERT INTO settings (key, scope, value) VALUES ('notes.greeting', '', '{"secretish":"stale-value-text"}')`).run();
    settings.resolve('notes.greeting', 'home');
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? '{}')).toMatchObject({ level: 40, key: 'notes.greeting', scope: 'global' });
    expect(lines[0]).not.toContain('stale-value-text');
  });
});
