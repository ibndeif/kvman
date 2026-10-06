import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { presetSchema, type Preset } from '@kvman/sdk';
import { makeRoot, readStoredFile, startPresetKernel, userCall, writePresetFile } from './support.ts';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('the first edit of the bundled preset copies it (02 §2.10, ADR 0010, 5)', () => {
  it('QA17-H2 an install copies the bundled preset to <home>/presets, and a second edit changes only that copy', async () => {
    const { root, home, homeFolder } = makeRoot(roots);
    const bundledDir = path.join(root, 'bundled');
    mkdirSync(bundledDir, { recursive: true });
    const bundledFile = path.join(bundledDir, 'coder.json');
    const bundledPreset: Preset = { name: 'coder', extensions: {}, settings: { 'kernel.workers': 1 } };
    writePresetFile(bundledFile, bundledPreset);
    const bundledBefore = readStoredFile(bundledFile);
    const kernel = await startPresetKernel({ home, homeFolder, preset: bundledPreset, presetFolder: bundledDir });
    try {
      const copy = path.join(home, 'presets', 'coder.json');
      expect(await kernel.exec('kernel.extensions.install', { name: '@acme/notes', source: 'npm:1.2.3' }, userCall())).toEqual({
        file: copy,
        restartRequired: true,
      });
      expect(presetSchema.parse(JSON.parse(readStoredFile(copy)))).toEqual({
        name: 'coder',
        extensions: { '@acme/notes': 'npm:1.2.3' },
        settings: { 'kernel.workers': 1 },
      });
      expect(readStoredFile(bundledFile)).toBe(bundledBefore);
      expect(await kernel.exec('kernel.extensions.install', { name: '@acme/more', source: 'npm:2.0.0' }, userCall())).toEqual({
        file: copy,
        restartRequired: true,
      });
      expect(presetSchema.parse(JSON.parse(readStoredFile(copy))).extensions).toEqual({
        '@acme/notes': 'npm:1.2.3',
        '@acme/more': 'npm:2.0.0',
      });
      expect(readdirSync(path.join(home, 'presets')).sort()).toEqual(['coder.json', 'coder.json.good']);
      expect(readStoredFile(bundledFile)).toBe(bundledBefore);
    } finally {
      await kernel.close();
    }
  });
});
