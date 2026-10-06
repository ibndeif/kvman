import { existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { presetSchema, type Preset } from '@kvman/sdk';
import { discardPresetBackup, presetBackupFor, restorePresetBackup } from '../../src/index.ts';
import { makeRoot, readStoredFile, startPresetKernel, userCall, writeExtensionPackage, writePresetFile } from './support.ts';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const parsed = (file: string) => presetSchema.parse(JSON.parse(readStoredFile(file)));

describe('the first edit after a good start keeps a backup (02 §2.10, ADR 0024, 4)', { timeout: 30_000 }, () => {
  it('QA36-H3 install and uninstall write <file>.good once, and later edits leave it as it was', async () => {
    const { root, home, homeFolder } = makeRoot(roots);
    const file = path.join(home, 'presets', 'mine.json');
    writeExtensionPackage(path.join(root, 'old'), { name: '@acme/old', namespace: 'old' });
    const preset: Preset = { name: 'mine', extensions: { '@acme/old': `path:${path.join(root, 'old')}` }, settings: { 'kernel.workers': 1 } };
    writePresetFile(file, preset);
    const kernel = await startPresetKernel({ home, homeFolder, preset, presetFolder: path.dirname(file), presetSource: { origin: 'home', file } });
    try {
      expect(existsSync(presetBackupFor(file))).toBe(false);
      await kernel.exec('kernel.extensions.install', { name: '@acme/notes', source: 'npm:1.2.3' }, userCall());
      expect(parsed(presetBackupFor(file))).toEqual(preset);
      await kernel.exec('kernel.extensions.uninstall', { name: '@acme/old' }, userCall());
      expect(parsed(presetBackupFor(file))).toEqual(preset);
      expect(parsed(file).extensions).toEqual({ '@acme/notes': 'npm:1.2.3' });
    } finally {
      await kernel.close();
    }
  });

  it('QA36-H3 an uninstall as the first edit makes the backup too', async () => {
    const { root, home, homeFolder } = makeRoot(roots);
    const file = path.join(home, 'presets', 'mine.json');
    writeExtensionPackage(path.join(root, 'old'), { name: '@acme/old', namespace: 'old' });
    const preset: Preset = { name: 'mine', extensions: { '@acme/old': `path:${path.join(root, 'old')}` }, settings: { 'kernel.workers': 1 } };
    writePresetFile(file, preset);
    const kernel = await startPresetKernel({ home, homeFolder, preset, presetFolder: path.dirname(file), presetSource: { origin: 'home', file } });
    try {
      await kernel.exec('kernel.extensions.uninstall', { name: '@acme/old' }, userCall());
      expect(parsed(presetBackupFor(file))).toEqual(preset);
    } finally {
      await kernel.close();
    }
  });

  it('QA36-H4 the first edit of the bundled preset backs up the bundled one, beside its home copy', async () => {
    const { root, home, homeFolder } = makeRoot(roots);
    const bundledDir = path.join(root, 'bundled');
    mkdirSync(bundledDir, { recursive: true });
    const bundledPreset: Preset = { name: 'coder', extensions: {}, settings: { 'kernel.workers': 1 } };
    writePresetFile(path.join(bundledDir, 'coder.json'), bundledPreset);
    const kernel = await startPresetKernel({ home, homeFolder, preset: bundledPreset, presetFolder: bundledDir });
    try {
      await kernel.exec('kernel.extensions.install', { name: '@acme/notes', source: 'npm:1.2.3' }, userCall());
      const copy = path.join(home, 'presets', 'coder.json');
      expect(parsed(copy).extensions).toEqual({ '@acme/notes': 'npm:1.2.3' });
      expect(parsed(presetBackupFor(copy))).toEqual(bundledPreset);
    } finally {
      await kernel.close();
    }
  });

  it('QA36-H5 a file preset keeps its backup beside the file', async () => {
    const { root, home, homeFolder } = makeRoot(roots);
    const file = path.join(root, 'app.json');
    const preset: Preset = { name: 'app', extensions: {}, settings: { 'kernel.workers': 1 } };
    writePresetFile(file, preset);
    const kernel = await startPresetKernel({ home, homeFolder, preset, presetFolder: root, presetSource: { origin: 'file', file } });
    try {
      await kernel.exec('kernel.extensions.install', { name: '@acme/notes', source: 'npm:1.2.3' }, userCall());
      expect(presetBackupFor(file)).toBe(`${file}.good`);
      expect(parsed(`${file}.good`)).toEqual(preset);
    } finally {
      await kernel.close();
    }
  });

  it('QA36-H3 restore puts the backup in place and answers whether there was one, and discard removes it', async () => {
    const { home } = makeRoot(roots);
    const file = path.join(home, 'presets', 'mine.json');
    const before: Preset = { name: 'mine', extensions: {}, settings: { 'kernel.workers': 1 } };
    writePresetFile(file, { ...before, extensions: { '@acme/x': 'npm:1.0.0' } });
    writePresetFile(presetBackupFor(file), before);
    expect(restorePresetBackup(file)).toBe(true);
    expect(parsed(file)).toEqual(before);
    expect(existsSync(presetBackupFor(file))).toBe(false);
    expect(restorePresetBackup(file)).toBe(false);
    writePresetFile(presetBackupFor(file), before);
    discardPresetBackup(file);
    discardPresetBackup(file);
    expect(existsSync(presetBackupFor(file))).toBe(false);
  });
});
