import { existsSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Preset } from '@kvman/sdk';
import { extensionCall, makeRoot, readStoredFile, startPresetKernel, userCall, writePresetFile } from './support.ts';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function presetFiles(home: string): string[] {
  const folder = path.join(home, 'presets');
  if (!existsSync(folder)) return [];
  return (readdirSync(folder, { recursive: true }) as string[]).sort();
}

describe('only the preset commands touch the preset (02 §2.10, ADR 0010, 5)', () => {
  it('QA17-E8 a settings change and a preset get write no preset file, and the three commands answer an extension caller', async () => {
    const { home, homeFolder } = makeRoot(roots);
    const file = path.join(home, 'presets', 'mine.json');
    const preset: Preset = { name: 'mine', extensions: {}, settings: { 'kernel.workers': 1 } };
    writePresetFile(file, preset);
    const kernel = await startPresetKernel({ home, homeFolder, preset, presetFolder: path.dirname(file), presetSource: { origin: 'home', file } });
    try {
      const filesBefore = presetFiles(home);
      const bytesBefore = readStoredFile(file);
      expect(await kernel.exec('kernel.settings.set', { key: 'kernel.port', value: 3741, scope: 'global' }, userCall())).toEqual({});
      expect(presetFiles(home)).toEqual(filesBefore);
      expect(readStoredFile(file)).toBe(bytesBefore);
      expect(await kernel.exec('kernel.preset.get', {}, userCall())).toMatchObject({ origin: 'home', file });
      expect(presetFiles(home)).toEqual(filesBefore);
      expect(readStoredFile(file)).toBe(bytesBefore);
      const probe = extensionCall('@test/probe');
      expect(await kernel.exec('kernel.preset.get', {}, probe)).toMatchObject({ origin: 'home', file });
      await expect(kernel.exec('kernel.extensions.uninstall', { name: '@acme/missing' }, probe)).rejects.toMatchObject({
        problem: { code: 'NOT_FOUND' },
      });
      await expect(kernel.exec('kernel.extensions.install', { name: 'not a name!', source: 'npm:1.0.0' }, probe)).rejects.toMatchObject({
        problem: { code: 'VALIDATION_FAILED' },
      });
      expect(presetFiles(home)).toEqual(filesBefore);
      expect(readStoredFile(file)).toBe(bytesBefore);
    } finally {
      await kernel.close();
    }
  });
});
