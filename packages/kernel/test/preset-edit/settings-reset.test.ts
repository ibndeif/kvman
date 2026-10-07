import { existsSync, rmSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { presetBackupFor } from '../../src/index.ts';
import { readStoredFile, startPresetKernel, startSettingsRun, storedPreset, userCall, withOneWorker } from './support.ts';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const withDefaults = [
  { key: 'a.one', type: 'number', default: 0 },
  { key: 'a.two', type: 'number', default: 0 },
] as const;

describe('kernel.preset.settings.reset removes one value of the preset file (02 §2.12, ADR 0030, 4)', { timeout: 30_000 }, () => {
  it('QA42-H7 it removes one value and keeps the rest', async () => {
    const { kernel, file } = await startSettingsRun(roots, withDefaults, { 'a.one': 1, 'a.two': 2 });
    try {
      expect(await kernel.exec('kernel.preset.settings.reset', { key: 'a.two' }, userCall())).toEqual({ file, restartRequired: true });
      expect(storedPreset(file).settings).toEqual({ 'a.one': 1 });
    } finally {
      await kernel.close();
    }
  });

  it("QA42-E5 a key the preset doesn't have fails NOT_FOUND and the file is unchanged", async () => {
    const { kernel, file } = await startSettingsRun(roots, withDefaults, { 'a.one': 1 });
    try {
      const before = readStoredFile(file);
      await expect(kernel.exec('kernel.preset.settings.reset', { key: 'a.two' }, userCall())).rejects.toMatchObject({
        problem: { code: 'NOT_FOUND', params: { key: 'a.two' } },
      });
      expect(readStoredFile(file)).toBe(before);
      expect(existsSync(presetBackupFor(file))).toBe(false);
    } finally {
      await kernel.close();
    }
  });

  it('QA42-E6 a key registered without a default is refused and the file keeps it', async () => {
    const { kernel, file } = await startSettingsRun(roots, [{ key: 'a.one', type: 'number' }], { 'a.one': 1 });
    try {
      const before = readStoredFile(file);
      await expect(kernel.exec('kernel.preset.settings.reset', { key: 'a.one' }, userCall())).rejects.toMatchObject({
        problem: { code: 'VALIDATION_FAILED', params: { key: 'a.one' } },
      });
      expect(readStoredFile(file)).toBe(before);
      expect(existsSync(presetBackupFor(file))).toBe(false);
    } finally {
      await kernel.close();
    }
  });

  it('QA42-E7 removing the last value leaves a valid preset that starts', async () => {
    const { kernel, file, home, homeFolder } = await startSettingsRun(roots, withDefaults, { 'a.two': 2 });
    try {
      await kernel.exec('kernel.preset.settings.reset', { key: 'a.two' }, userCall());
    } finally {
      await kernel.close();
    }
    const stored = storedPreset(file);
    expect(stored).toEqual({ name: 'mine', extensions: stored.extensions });
    const restarted = await startPresetKernel({ home, homeFolder, preset: withOneWorker(stored), presetFolder: home, presetSource: { origin: 'home', file } });
    try {
      expect(await restarted.exec('kernel.health.get', {}, userCall())).toMatchObject({ preset: 'mine' });
    } finally {
      await restarted.close();
    }
  });
});
