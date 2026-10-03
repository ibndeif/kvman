import { rmSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { presetSchema, presetStateSchema, type Preset } from '@kvman/sdk';
import { makeRoot, readStoredFile, startPresetKernel, userCall, writeExtensionPackage, writePresetFile } from './support.ts';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('nothing requires a core extension (ADR 0010, 16)', () => {
  it('QA17-H28 a preset with one path extension starts, and get, install, and uninstall work', async () => {
    const { root, home, homeFolder } = makeRoot(roots);
    const extensionFolder = path.join(root, 'solo');
    writeExtensionPackage(extensionFolder, { name: '@test/solo', namespace: 'solo' });
    const presetsDir = path.join(home, 'presets');
    const file = path.join(presetsDir, 'mine.json');
    const source: `path:${string}` = `path:${path.relative(presetsDir, extensionFolder).split(path.sep).join('/')}`;
    const preset: Preset = { name: 'mine', extensions: { '@test/solo': source }, settings: { 'kernel.workers': 1 } };
    writePresetFile(file, preset);
    const kernel = await startPresetKernel({ home, homeFolder, preset, presetFolder: presetsDir, presetSource: { origin: 'home', file } });
    try {
      expect(presetStateSchema.parse(await kernel.exec('kernel.preset.get', {}, userCall()))).toEqual({
        name: 'mine',
        extensions: { '@test/solo': source },
        settings: { 'kernel.workers': 1 },
        origin: 'home',
        file,
      });
      expect(await kernel.exec('solo.ping', {}, userCall())).toEqual({ answer: 'pong' });
      expect(await kernel.exec('kernel.extensions.install', { name: '@acme/extra', source: 'npm:1.0.0' }, userCall())).toEqual({
        file,
        restartRequired: true,
      });
      expect(presetSchema.parse(JSON.parse(readStoredFile(file))).extensions).toEqual({ '@test/solo': source, '@acme/extra': 'npm:1.0.0' });
      expect(await kernel.exec('kernel.extensions.uninstall', { name: '@acme/extra' }, userCall())).toEqual({ file, restartRequired: true });
      expect(presetSchema.parse(JSON.parse(readStoredFile(file))).extensions).toEqual({ '@test/solo': source });
    } finally {
      await kernel.close();
    }
  });
});
