import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Preset } from '@kvman/sdk';
import { openDatabase } from '../../src/storage/database.ts';
import { makeRoot, readStoredFile, startPresetKernel, startSettingsRun, storedPreset, userCall, withOneWorker, writePresetFile } from './support.ts';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const failed = { problem: { code: 'VALIDATION_FAILED' } };

const savedPresets = (home: string): string[] => readdirSync(path.join(home, 'presets')).sort();

function notesApp(root: string, settings: Record<string, string> = { 'kvwebui.home': 'notes.list' }): Preset {
  return { name: 'notes-app', extensions: { '@kvman/kvai': 'bundled', notes: `path:${path.join(root, 'notes')}` }, settings };
}

describe('kernel.presets.save writes a preset by its name (02 §2.10, ADR 0030, 5)', { timeout: 30_000 }, () => {
  it('QA42-H8 it writes <home>/presets/<name>.json and leaves the running preset as it is', async () => {
    const { kernel, root, home } = await startSettingsRun(roots, [], undefined);
    try {
      const before = await kernel.exec('kernel.preset.get', {}, userCall());
      const preset = notesApp(root);
      expect(await kernel.exec('kernel.presets.save', { preset }, userCall())).toEqual({ file: path.join(home, 'presets', 'notes-app.json') });
      expect(storedPreset(path.join(home, 'presets', 'notes-app.json'))).toEqual(preset);
      expect(await kernel.exec('kernel.preset.get', {}, userCall())).toEqual(before);
    } finally {
      await kernel.close();
    }
  });

  it('QA42-H9 replace: true overwrites a saved preset', async () => {
    const { kernel, root, home } = await startSettingsRun(roots, [], undefined);
    try {
      const file = path.join(home, 'presets', 'notes-app.json');
      await kernel.exec('kernel.presets.save', { preset: notesApp(root) }, userCall());
      const other = notesApp(root, { 'kvwebui.title': 'notes.app.title' });
      expect(await kernel.exec('kernel.presets.save', { preset: other, replace: true }, userCall())).toEqual({ file });
      expect(storedPreset(file)).toEqual(other);
    } finally {
      await kernel.close();
    }
  });

  it('QA42-E10 an existing preset is not overwritten without replace, and not with replace: false', async () => {
    const { kernel, root, home } = await startSettingsRun(roots, [], undefined);
    try {
      const file = path.join(home, 'presets', 'notes-app.json');
      await kernel.exec('kernel.presets.save', { preset: notesApp(root) }, userCall());
      const first = readStoredFile(file);
      const other = notesApp(root, { 'kvwebui.title': 'notes.app.title' });
      await expect(kernel.exec('kernel.presets.save', { preset: other }, userCall())).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED', params: { file } } });
      await expect(kernel.exec('kernel.presets.save', { preset: other, replace: false }, userCall())).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED', params: { file } } });
      expect(readStoredFile(file)).toBe(first);
    } finally {
      await kernel.close();
    }
  });

  it("QA42-E11 the running preset's name is refused, with replace too, for a bundled and for a home preset", async () => {
    const homeRun = await startSettingsRun(roots, [], undefined);
    try {
      const before = readStoredFile(homeRun.file);
      for (const replace of [undefined, true]) {
        const preset: Preset = { name: 'mine', extensions: {} };
        await expect(homeRun.kernel.exec('kernel.presets.save', { preset, ...(replace === undefined ? {} : { replace }) }, userCall())).rejects.toMatchObject({
          problem: { code: 'VALIDATION_FAILED', params: { name: 'mine' } },
        });
      }
      expect(readStoredFile(homeRun.file)).toBe(before);
      expect(savedPresets(homeRun.home)).toEqual(['mine.json']);
    } finally {
      await homeRun.kernel.close();
    }
    const { root, home, homeFolder } = makeRoot(roots);
    const bundledDir = path.join(root, 'bundled');
    mkdirSync(bundledDir, { recursive: true });
    const bundledPreset: Preset = { name: 'coder', extensions: {} };
    writePresetFile(path.join(bundledDir, 'coder.json'), bundledPreset);
    const bundledRun = await startPresetKernel({ home, homeFolder, preset: withOneWorker(bundledPreset), presetFolder: bundledDir });
    try {
      for (const replace of [undefined, true]) {
        await expect(bundledRun.exec('kernel.presets.save', { preset: bundledPreset, ...(replace === undefined ? {} : { replace }) }, userCall())).rejects.toMatchObject({
          problem: { code: 'VALIDATION_FAILED', params: { name: 'coder' } },
        });
      }
      expect(existsSync(path.join(home, 'presets'))).toBe(false);
    } finally {
      await bundledRun.close();
    }
  });

  it('QA42-E12 a path: source must be an absolute folder', async () => {
    const { kernel, home } = await startSettingsRun(roots, [], undefined);
    try {
      for (const source of ['path:./notes', 'path:notes']) {
        await expect(kernel.exec('kernel.presets.save', { preset: { name: 'notes-app', extensions: { notes: source } } }, userCall())).rejects.toMatchObject({
          problem: { code: 'VALIDATION_FAILED', params: { name: 'notes', source } },
        });
      }
      expect(savedPresets(home)).toEqual(['mine.json']);
    } finally {
      await kernel.close();
    }
  });

  it("QA42-E13 a value that isn't a preset, and a name that isn't lowercase kebab case, fail and write nothing", async () => {
    const { kernel, root, home } = await startSettingsRun(roots, [], undefined);
    try {
      const valid = notesApp(root);
      const inputs: unknown[] = [
        { preset: { extensions: {} } },
        { preset: { ...valid, extra: true } },
        { preset: { name: 'notes-app', extensions: { notes: 'git:notes' } } },
        ...['Notes', 'notes_app', '../x', 'a/b', 'x.json'].map((name) => ({ preset: { ...valid, name } })),
      ];
      for (const input of inputs) {
        await expect(kernel.exec('kernel.presets.save', input, userCall()), JSON.stringify(input)).rejects.toMatchObject(failed);
      }
      expect(readdirSync(path.join(home, 'presets'), { recursive: true }).sort()).toEqual(['mine.json']);
      expect(existsSync(path.join(home, 'x.json'))).toBe(false);
    } finally {
      await kernel.close();
    }
  });

  it('QA42-E14 saving installs and trusts nothing, and the running extensions are unchanged', async () => {
    const { kernel, root, home } = await startSettingsRun(roots, [], undefined);
    try {
      const before = await kernel.exec('kernel.extensions.list', {}, userCall());
      const preset: Preset = { name: 'notes-app', extensions: { '@acme/remote': 'npm:1.2.3', notes: `path:${path.join(root, 'notes')}` } };
      await kernel.exec('kernel.presets.save', { preset }, userCall());
      expect(existsSync(path.join(home, 'extensions'))).toBe(false);
      expect(await kernel.exec('kernel.extensions.list', {}, userCall())).toEqual(before);
      const database = openDatabase(path.join(home, 'kvman.db'));
      try {
        expect(database.prepare('SELECT name FROM accepted_extensions').all()).toEqual([{ name: '@test/a' }]);
      } finally {
        database.close();
      }
    } finally {
      await kernel.close();
    }
  });
});
