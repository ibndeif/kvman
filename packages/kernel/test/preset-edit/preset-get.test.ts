import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { presetStateSchema, type Preset } from '@kvman/sdk';
import { makeRoot, readStoredFile, startPresetKernel, userCall, writePresetFile } from './support.ts';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('kernel.preset.get shows the stored preset (02 §2.12, ADR 0010, 5)', () => {
  it('QA17-H4 get answers the bundled preset, then the home copy after an edit, and a file preset by file', async () => {
    const { root, home, homeFolder } = makeRoot(roots);
    const bundledDir = path.join(root, 'bundled');
    mkdirSync(bundledDir, { recursive: true });
    const bundledPreset: Preset = { name: 'coder', extensions: {}, settings: { 'kernel.workers': 1 } };
    const bundled = await startPresetKernel({ home, homeFolder, preset: bundledPreset, presetFolder: bundledDir });
    try {
      const stored = presetStateSchema.parse(await bundled.exec('kernel.preset.get', {}, userCall()));
      expect(stored).toEqual({ name: 'coder', extensions: {}, settings: { 'kernel.workers': 1 }, origin: 'bundled' });
      expect(stored).not.toHaveProperty('file');
      const copy = path.join(home, 'presets', 'coder.json');
      expect(await bundled.exec('kernel.extensions.install', { name: '@acme/notes', source: 'npm:1.2.3' }, userCall())).toEqual({
        file: copy,
        restartRequired: true,
      });
      expect(presetStateSchema.parse(await bundled.exec('kernel.preset.get', {}, userCall()))).toEqual({
        name: 'coder',
        extensions: { '@acme/notes': 'npm:1.2.3' },
        settings: { 'kernel.workers': 1 },
        origin: 'home',
        file: copy,
      });
      expect(await bundled.exec('kernel.extensions.list', {}, userCall())).toEqual([]);
    } finally {
      await bundled.close();
    }
    const file = path.join(root, 'app.json');
    const filePreset: Preset = { name: 'app', extensions: {}, settings: { 'kernel.workers': 1 } };
    writePresetFile(file, filePreset);
    const fromFile = await startPresetKernel({ home, homeFolder, preset: filePreset, presetFolder: path.dirname(file), presetSource: { origin: 'file', file } });
    try {
      expect(presetStateSchema.parse(await fromFile.exec('kernel.preset.get', {}, userCall()))).toEqual({
        name: 'app',
        extensions: {},
        settings: { 'kernel.workers': 1 },
        origin: 'file',
        file,
      });
      expect(readStoredFile(file)).toContain('"app"');
      await fromFile.exec('kernel.extensions.install', { name: '@acme/notes', source: 'npm:1.2.3' }, userCall());
      expect(presetStateSchema.parse(await fromFile.exec('kernel.preset.get', {}, userCall()))).toMatchObject({
        origin: 'file',
        file,
        extensions: { '@acme/notes': 'npm:1.2.3' },
      });
    } finally {
      await fromFile.close();
    }
  });
});
