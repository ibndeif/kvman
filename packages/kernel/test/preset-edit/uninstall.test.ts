import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { presetSchema, type Preset } from '@kvman/sdk';
import { makeRoot, readStoredFile, startPresetKernel, userCall, writeExtensionPackage, writePresetFile } from './support.ts';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function homeRun(home: string, homeFolder: string, file: string, preset: Preset) {
  writePresetFile(file, preset);
  return startPresetKernel({ home, homeFolder, preset, presetFolder: path.dirname(file), presetSource: { origin: 'home', file } });
}

function relativeSource(from: string, to: string): `path:${string}` {
  return `path:${path.relative(from, to).split(path.sep).join('/')}`;
}

describe('uninstall removes an entry (02 §2.10, ADR 0010, 5)', () => {
  it('QA17-H3 uninstall answers the file and removes only the entry', async () => {
    const { root, home, homeFolder } = makeRoot(roots);
    const presetsDir = path.join(home, 'presets');
    const file = path.join(presetsDir, 'mine.json');
    const sourceOf = (folder: string): `path:${string}` =>
      `path:${path.relative(presetsDir, path.join(root, folder)).split(path.sep).join('/')}`;
    writeExtensionPackage(path.join(root, 'keep'), { name: '@acme/keep', namespace: 'keep' });
    writeExtensionPackage(path.join(root, 'notes'), { name: '@acme/notes', namespace: 'notes' });
    const keep = sourceOf('keep');
    const preset: Preset = {
      name: 'mine',
      extensions: { '@acme/keep': keep, '@acme/notes': sourceOf('notes') },
      settings: { 'kernel.workers': 1 },
    };
    const kernel = await homeRun(home, homeFolder, file, preset);
    try {
      expect(await kernel.exec('kernel.extensions.uninstall', { name: '@acme/notes' }, userCall())).toEqual({ file, restartRequired: true });
      expect(presetSchema.parse(JSON.parse(readStoredFile(file)))).toEqual({
        name: 'mine',
        extensions: { '@acme/keep': keep },
        settings: { 'kernel.workers': 1 },
      });
    } finally {
      await kernel.close();
    }
  });

  it("QA17-E3 uninstalling what is not there fails NOT_FOUND and copies nothing", async () => {
    const { home, homeFolder } = makeRoot(roots);
    const bundledPreset: Preset = { name: 'coder', extensions: {}, settings: { 'kernel.workers': 1 } };
    const kernel = await startPresetKernel({ home, homeFolder, preset: bundledPreset, presetFolder: homeFolder });
    try {
      await expect(kernel.exec('kernel.extensions.uninstall', { name: '@acme/missing' }, userCall())).rejects.toMatchObject({
        problem: { code: 'NOT_FOUND' },
      });
      expect(existsSync(path.join(home, 'presets', 'coder.json'))).toBe(false);
    } finally {
      await kernel.close();
    }
  });

  it("QA17-E4 a dependency cannot be removed before its dependent", async () => {
    const { root, home, homeFolder } = makeRoot(roots);
    const presetsDir = path.join(home, 'presets');
    const file = path.join(presetsDir, 'mine.json');
    const lowerFolder = path.join(root, 'extensions', 'lower');
    const upperFolder = path.join(root, 'extensions', 'upper');
    writeExtensionPackage(lowerFolder, { name: '@test/lower', namespace: 'lower' });
    writeExtensionPackage(upperFolder, { name: '@test/upper', namespace: 'upper', dependencies: { '@test/lower': '^1.0.0' } });
    const preset: Preset = {
      name: 'mine',
      extensions: { '@test/upper': relativeSource(presetsDir, upperFolder), '@test/lower': relativeSource(presetsDir, lowerFolder) },
      settings: { 'kernel.workers': 1 },
    };
    const kernel = await homeRun(home, homeFolder, file, preset);
    try {
      const before = readStoredFile(file);
      await expect(kernel.exec('kernel.extensions.uninstall', { name: '@test/lower' }, userCall())).rejects.toMatchObject({
        problem: { code: 'VALIDATION_FAILED', message: expect.stringContaining('@test/upper') },
      });
      expect(readStoredFile(file)).toBe(before);
      expect(await kernel.exec('kernel.extensions.uninstall', { name: '@test/upper' }, userCall())).toEqual({ file, restartRequired: true });
      expect(await kernel.exec('kernel.extensions.uninstall', { name: '@test/lower' }, userCall())).toEqual({ file, restartRequired: true });
      expect(presetSchema.parse(JSON.parse(readStoredFile(file)))).toEqual({ name: 'mine', extensions: {}, settings: { 'kernel.workers': 1 } });
    } finally {
      await kernel.close();
    }
  });
});
