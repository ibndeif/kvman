import { existsSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { presetSchema, type Preset } from '@kvman/sdk';
import { makeRoot, readStoredFile, startPresetKernel, userCall, writePresetFile } from './support.ts';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('preset files are always valid, whole, and named (02 §2.10, ADR 0010, 12 and 13)', () => {
  it('QA17-E5 a written preset is valid JSON with a trailing newline and key order, and a failed write fails VALIDATION_FAILED', async () => {
    const { home, homeFolder } = makeRoot(roots);
    const presetsDir = path.join(home, 'presets');
    const file = path.join(presetsDir, 'mine.json');
    const preset: Preset = { name: 'mine', extensions: {}, settings: { 'kernel.workers': 1 } };
    writePresetFile(file, preset);
    const kernel = await startPresetKernel({ home, homeFolder, preset, presetFolder: presetsDir, presetSource: { origin: 'home', file } });
    try {
      await kernel.exec('kernel.extensions.install', { source: 'npm:@acme/notes@1.2.3' }, userCall());
      const text = readStoredFile(file);
      expect(presetSchema.safeParse(JSON.parse(text)).success).toBe(true);
      expect(text.endsWith('\n')).toBe(true);
      const nameAt = text.indexOf('"name"');
      const extensionsAt = text.indexOf('"extensions"');
      const settingsAt = text.indexOf('"settings"');
      expect(nameAt).toBeGreaterThanOrEqual(0);
      expect(extensionsAt).toBeGreaterThan(nameAt);
      expect(settingsAt).toBeGreaterThan(extensionsAt);
      expect(readdirSync(presetsDir).filter((entry) => entry.endsWith('.tmp'))).toEqual([]);
    } finally {
      await kernel.close();
    }
    const blocked = makeRoot(roots);
    writeFileSync(path.join(blocked.home, 'presets'), 'in the way');
    const target = path.join(blocked.home, 'presets', 'mine.json');
    const blockedKernel = await startPresetKernel({ home: blocked.home, homeFolder: blocked.homeFolder, preset, presetFolder: blocked.homeFolder });
    try {
      await expect(blockedKernel.exec('kernel.extensions.install', { source: 'npm:@acme/notes@1.2.3' }, userCall())).rejects.toMatchObject(
        {
          problem: { code: 'VALIDATION_FAILED', params: { file: target } },
        },
      );
      expect(existsSync(target)).toBe(false);
      expect(readStoredFile(path.join(blocked.home, 'presets'))).toBe('in the way');
      expect(await blockedKernel.exec('kernel.preset.get', {}, userCall())).toMatchObject({ origin: 'bundled', extensions: {} });
    } finally {
      await blockedKernel.close();
    }
  });

  it('QA17-E9 a stored preset broken by hand fails VALIDATION_FAILED naming the file, and is left alone', async () => {
    const { home, homeFolder } = makeRoot(roots);
    const file = path.join(home, 'presets', 'mine.json');
    const preset: Preset = { name: 'mine', extensions: {}, settings: { 'kernel.workers': 1 } };
    writePresetFile(file, preset);
    const kernel = await startPresetKernel({ home, homeFolder, preset, presetFolder: path.dirname(file), presetSource: { origin: 'home', file } });
    try {
      for (const broken of ['{ nope', JSON.stringify({ name: 'mine' })]) {
        writeFileSync(file, broken);
        await expect(kernel.exec('kernel.preset.get', {}, userCall()), broken).rejects.toMatchObject({
          problem: { code: 'VALIDATION_FAILED', params: { file } },
        });
        await expect(kernel.exec('kernel.extensions.install', { source: 'npm:@acme/notes@1.2.3' }, userCall()), broken).rejects.toMatchObject(
          {
            problem: { code: 'VALIDATION_FAILED', params: { file } },
          },
        );
        await expect(kernel.exec('kernel.extensions.uninstall', { name: '@acme/notes' }, userCall()), broken).rejects.toMatchObject({
          problem: { code: 'VALIDATION_FAILED', params: { file } },
        });
        expect(readStoredFile(file)).toBe(broken);
      }
    } finally {
      await kernel.close();
    }
  });
});
