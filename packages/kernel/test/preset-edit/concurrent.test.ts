import { rmSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { presetSchema, type Preset } from '@kvman/sdk';
import { makeRoot, readStoredFile, startPresetKernel, userCall, writePresetFile } from './support.ts';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('preset edits are serialized (02 §2.10, ADR 0010, 13)', () => {
  it('QA17-E6 two edits at once both land', async () => {
    const { home, homeFolder } = makeRoot(roots);
    const file = path.join(home, 'presets', 'mine.json');
    const preset: Preset = { name: 'mine', extensions: {}, settings: { 'kernel.workers': 1 } };
    writePresetFile(file, preset);
    const kernel = await startPresetKernel({ home, homeFolder, preset, presetFolder: path.dirname(file), presetSource: { origin: 'home', file } });
    try {
      const firstInstall = kernel.exec('kernel.extensions.install', { source: 'npm:@acme/alpha@1.0.0' }, userCall());
      const secondInstall = kernel.exec('kernel.extensions.install', { source: 'npm:@acme/beta@2.0.0' }, userCall());
      const [firstAnswer, secondAnswer] = await Promise.all([firstInstall, secondInstall]);
      expect(firstAnswer).toEqual({ file, restartRequired: true });
      expect(secondAnswer).toEqual({ file, restartRequired: true });
      expect(presetSchema.parse(JSON.parse(readStoredFile(file))).extensions).toEqual({
        '@acme/alpha': 'npm:1.0.0',
        '@acme/beta': 'npm:2.0.0',
      });
      const thirdInstall = kernel.exec('kernel.extensions.install', { source: 'npm:@acme/gamma@3.0.0' }, userCall());
      const removal = kernel.exec('kernel.extensions.uninstall', { name: '@acme/alpha' }, userCall());
      const [thirdAnswer, removalAnswer] = await Promise.all([thirdInstall, removal]);
      expect(thirdAnswer).toEqual({ file, restartRequired: true });
      expect(removalAnswer).toEqual({ file, restartRequired: true });
      expect(presetSchema.parse(JSON.parse(readStoredFile(file))).extensions).toEqual({
        '@acme/beta': 'npm:2.0.0',
        '@acme/gamma': 'npm:3.0.0',
      });
    } finally {
      await kernel.close();
    }
  });
});
