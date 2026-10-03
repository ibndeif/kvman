import { rmSync } from 'node:fs';
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

describe('install writes the person\'s preset (02 §2.10, ADR 0010, 5)', () => {
  it('QA17-H1 install answers the file, adds the entry, and loads nothing', async () => {
    const { root, home, homeFolder } = makeRoot(roots);
    const presetsDir = path.join(home, 'presets');
    const file = path.join(presetsDir, 'mine.json');
    writeExtensionPackage(path.join(root, 'keep'), { name: '@test/keep', namespace: 'keep' });
    const keep = `path:${path.relative(presetsDir, path.join(root, 'keep')).split(path.sep).join('/')}` as const;
    const preset: Preset = { name: 'mine', extensions: { '@test/keep': keep }, settings: { 'kernel.workers': 1 } };
    const kernel = await homeRun(home, homeFolder, file, preset);
    try {
      const before = await kernel.exec('kernel.extensions.list', {}, userCall());
      expect(await kernel.exec('kernel.extensions.install', { name: '@acme/notes', source: 'npm:1.2.3' }, userCall())).toEqual({
        file,
        restartRequired: true,
      });
      expect(presetSchema.parse(JSON.parse(readStoredFile(file)))).toEqual({
        name: 'mine',
        extensions: { '@test/keep': keep, '@acme/notes': 'npm:1.2.3' },
        settings: { 'kernel.workers': 1 },
      });
      expect(await kernel.exec('kernel.extensions.list', {}, userCall())).toEqual(before);
    } finally {
      await kernel.close();
    }
  });

  it("QA17-H5 install with source bundled puts a removed bundled extension back", async () => {
    const { root, home, homeFolder } = makeRoot(roots);
    const file = path.join(home, 'presets', 'mine.json');
    const preset: Preset = { name: 'mine', extensions: {}, settings: { 'kernel.workers': 1 } };
    writePresetFile(file, preset);
    const bundled = new Map([['@kvman/kvcoder', path.join(root, 'bundled-kvcoder')]]);
    const kernel = await startPresetKernel({ home, homeFolder, preset, presetFolder: path.dirname(file), presetSource: { origin: 'home', file }, bundled });
    try {
      expect(await kernel.exec('kernel.extensions.install', { name: '@kvman/kvcoder', source: 'bundled' }, userCall())).toEqual({
        file,
        restartRequired: true,
      });
      expect(presetSchema.parse(JSON.parse(readStoredFile(file))).extensions).toEqual({
        '@kvman/kvcoder': 'bundled',
      });
    } finally {
      await kernel.close();
    }
  });

  it('QA17-E1 a bad source fails VALIDATION_FAILED and the file is unchanged', async () => {
    const { home, homeFolder } = makeRoot(roots);
    const file = path.join(home, 'presets', 'mine.json');
    const preset: Preset = { name: 'mine', extensions: {}, settings: { 'kernel.workers': 1 } };
    const kernel = await homeRun(home, homeFolder, file, preset);
    try {
      const before = readStoredFile(file);
      const bad: Array<{ name: string; source: string }> = [
        { name: '@acme/a', source: 'npm:^1.2.3' },
        { name: '@acme/a', source: 'npm:' },
        { name: '@acme/a', source: 'path:' },
        { name: '@acme/a', source: 'git:x' },
        { name: '@acme/a', source: '' },
        { name: '@acme/a', source: 'bundled' },
      ];
      for (const input of bad) {
        await expect(kernel.exec('kernel.extensions.install', input, userCall()), input.source).rejects.toMatchObject({
          problem: { code: 'VALIDATION_FAILED' },
        });
      }
      await expect(kernel.exec('kernel.extensions.install', { name: '@acme/a', source: 'bundled' }, userCall())).rejects.toMatchObject({
        problem: { code: 'VALIDATION_FAILED', message: expect.stringContaining('bundled') },
      });
      expect(readStoredFile(file)).toBe(before);
    } finally {
      await kernel.close();
    }
  });

  it('QA17-E2 a name already present, and an invalid npm package name, fail VALIDATION_FAILED', async () => {
    const { root, home, homeFolder } = makeRoot(roots);
    const presetsDir = path.join(home, 'presets');
    const file = path.join(presetsDir, 'mine.json');
    writeExtensionPackage(path.join(root, 'notes'), { name: '@test/notes', namespace: 'notes' });
    const notes = `path:${path.relative(presetsDir, path.join(root, 'notes')).split(path.sep).join('/')}` as const;
    const preset: Preset = { name: 'mine', extensions: { '@test/notes': notes }, settings: { 'kernel.workers': 1 } };
    const kernel = await homeRun(home, homeFolder, file, preset);
    try {
      const before = readStoredFile(file);
      await expect(kernel.exec('kernel.extensions.install', { name: '@test/notes', source: 'npm:1.2.3' }, userCall())).rejects.toMatchObject({
        problem: { code: 'VALIDATION_FAILED', message: expect.stringContaining('already in the preset') },
      });
      await expect(kernel.exec('kernel.extensions.install', { name: 'not a name!', source: 'npm:1.0.0' }, userCall())).rejects.toMatchObject({
        problem: { code: 'VALIDATION_FAILED' },
      });
      expect(readStoredFile(file)).toBe(before);
    } finally {
      await kernel.close();
    }
  });
});
