import { existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { z, type Preset } from '@kvman/sdk';
import { presetBackupFor } from '../../src/index.ts';
import { makeRoot, readStoredFile, startPresetKernel, startSettingsRun, storedPreset, userCall, writeExtensionPackage, writePresetFile } from './support.ts';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const topLevelKeys = (file: string): string[] => Object.keys(z.record(z.string(), z.unknown()).parse(JSON.parse(readStoredFile(file))));

const numbers = [
  { key: 'a.one', type: 'number', default: 0 },
  { key: 'a.two', type: 'number', default: 0 },
] as const;

describe('kernel.preset.settings.set edits one value of the preset file (02 §2.12, ADR 0030, 4)', { timeout: 30_000 }, () => {
  it('QA42-H1 it sets one value, keeps the rest, and kernel.preset.get shows the same', async () => {
    const { kernel, file, preset } = await startSettingsRun(roots, numbers, { 'a.one': 1 });
    try {
      expect(await kernel.exec('kernel.preset.settings.set', { key: 'a.two', value: 2 }, userCall())).toEqual({ file, restartRequired: true });
      const stored = storedPreset(file);
      expect(stored).toEqual({ name: 'mine', extensions: preset.extensions, settings: { 'a.one': 1, 'a.two': 2 } });
      expect(await kernel.exec('kernel.preset.get', {}, userCall())).toEqual({ ...stored, origin: 'home', file });
    } finally {
      await kernel.close();
    }
  });

  it('QA42-H2 setting a key again replaces its value', async () => {
    const { kernel, file } = await startSettingsRun(roots, numbers, { 'a.one': 1 });
    try {
      await kernel.exec('kernel.preset.settings.set', { key: 'a.one', value: 5 }, userCall());
      expect(storedPreset(file).settings).toEqual({ 'a.one': 5 });
      expect(readStoredFile(file).match(/"a\.one"/g)).toHaveLength(1);
    } finally {
      await kernel.close();
    }
  });

  it('QA42-H3 a preset with no settings gains them, after extensions', async () => {
    const { kernel, file } = await startSettingsRun(roots, numbers, undefined);
    try {
      expect(topLevelKeys(file)).toEqual(['name', 'extensions']);
      await kernel.exec('kernel.preset.settings.set', { key: 'a.two', value: 2 }, userCall());
      expect(topLevelKeys(file)).toEqual(['name', 'extensions', 'settings']);
      expect(storedPreset(file).settings).toEqual({ 'a.two': 2 });
    } finally {
      await kernel.close();
    }
  });

  it('QA42-H4 the first edit of the bundled preset copies it to <home>/presets', async () => {
    const { root, home, homeFolder } = makeRoot(roots);
    const extensionFolder = path.join(root, 'a');
    writeExtensionPackage(extensionFolder, { name: '@test/a', namespace: 'a', settings: numbers });
    const bundledDir = path.join(root, 'bundled');
    mkdirSync(bundledDir, { recursive: true });
    const bundledPreset: Preset = { name: 'coder', extensions: { '@test/a': `path:${extensionFolder}` }, settings: { 'a.one': 1, 'kernel.workers': 1 } };
    writePresetFile(path.join(bundledDir, 'coder.json'), bundledPreset);
    const kernel = await startPresetKernel({ home, homeFolder, preset: bundledPreset, presetFolder: bundledDir });
    try {
      const copy = path.join(home, 'presets', 'coder.json');
      expect(await kernel.exec('kernel.preset.settings.set', { key: 'a.two', value: 2 }, userCall())).toEqual({ file: copy, restartRequired: true });
      const expected = { ...bundledPreset, settings: { 'a.one': 1, 'kernel.workers': 1, 'a.two': 2 } };
      expect(storedPreset(copy)).toEqual(expected);
      expect(await kernel.exec('kernel.preset.get', {}, userCall())).toEqual({ ...expected, origin: 'home', file: copy });
    } finally {
      await kernel.close();
    }
  });

  it('QA42-H5 an edit of a value keeps the backup of the first one', async () => {
    const { kernel, file, preset } = await startSettingsRun(roots, numbers, { 'a.one': 1 });
    try {
      await kernel.exec('kernel.preset.settings.set', { key: 'a.two', value: 2 }, userCall());
      const backup = readStoredFile(presetBackupFor(file));
      expect(storedPreset(presetBackupFor(file))).toEqual(preset);
      await kernel.exec('kernel.preset.settings.set', { key: 'a.one', value: 9 }, userCall());
      expect(readStoredFile(presetBackupFor(file))).toBe(backup);
      expect(storedPreset(file).settings).toEqual({ 'a.one': 9, 'a.two': 2 });
    } finally {
      await kernel.close();
    }
  });

  it("QA42-E1 a registered key's value that doesn't fit its schema fails VALIDATION_FAILED and changes nothing", async () => {
    const { kernel, file } = await startSettingsRun(roots, numbers, { 'a.one': 1 });
    try {
      const before = readStoredFile(file);
      await expect(kernel.exec('kernel.preset.settings.set', { key: 'a.two', value: 'x' }, userCall())).rejects.toMatchObject({
        problem: { code: 'VALIDATION_FAILED' },
      });
      expect(readStoredFile(file)).toBe(before);
      expect(existsSync(presetBackupFor(file))).toBe(false);
    } finally {
      await kernel.close();
    }
  });

  it('QA42-E2 an unknown key is refused while every extension of the preset is loaded', async () => {
    const { kernel, file } = await startSettingsRun(roots, numbers, { 'a.one': 1 });
    try {
      const before = readStoredFile(file);
      await expect(kernel.exec('kernel.preset.settings.set', { key: 'nobody.key', value: 1 }, userCall())).rejects.toMatchObject({
        problem: { code: 'VALIDATION_FAILED', params: { key: 'nobody.key' } },
      });
      expect(readStoredFile(file)).toBe(before);
      expect(existsSync(presetBackupFor(file))).toBe(false);
    } finally {
      await kernel.close();
    }
  });

  it('QA42-E3 an unknown key is taken while an extension of the preset waits for its first start', async () => {
    const { kernel, file } = await startSettingsRun(roots, numbers, { 'a.one': 1 });
    try {
      await kernel.exec('kernel.extensions.install', { source: 'npm:@acme/later@1.0.0' }, userCall());
      expect(await kernel.exec('kernel.preset.settings.set', { key: 'later.mode', value: 'on' }, userCall())).toEqual({ file, restartRequired: true });
      expect(storedPreset(file).settings).toEqual({ 'a.one': 1, 'later.mode': 'on' });
    } finally {
      await kernel.close();
    }
  });

  it('QA42-E4 a preset-only key and a key in every scope are both written', async () => {
    const settings = [
      { key: 'a.pinned', type: 'string', default: 'old', scopes: [] },
      { key: 'a.shared', type: 'string', default: 'old' },
    ] as const;
    const { kernel, file } = await startSettingsRun(roots, settings, undefined);
    try {
      await kernel.exec('kernel.preset.settings.set', { key: 'a.pinned', value: 'new' }, userCall());
      await kernel.exec('kernel.preset.settings.set', { key: 'a.shared', value: 'new' }, userCall());
      expect(storedPreset(file).settings).toEqual({ 'a.pinned': 'new', 'a.shared': 'new' });
    } finally {
      await kernel.close();
    }
  });
});
