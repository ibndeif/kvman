import { rmSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { presetSchema, type Preset } from '@kvman/sdk';
import { makeRoot, readStoredFile, startPresetKernel, userCall, writeExtensionPackage, writePresetFile } from './support.ts';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('an edit applies at the next start (02 §2.10, ADR 0010, 5)', () => {
  it('QA17-H6 an installed path extension loads after a restart, and an uninstalled one is gone', async () => {
    const { root, home, homeFolder } = makeRoot(roots);
    const extensionFolder = path.join(root, 'notes');
    writeExtensionPackage(extensionFolder, { name: '@test/notes', namespace: 'notes' });
    const presetsDir = path.join(home, 'presets');
    const file = path.join(presetsDir, 'mine.json');
    const source: `path:${string}` = `path:${path.relative(presetsDir, extensionFolder).split(path.sep).join('/')}`;
    const preset: Preset = { name: 'mine', extensions: {}, settings: { 'kernel.workers': 1 } };
    writePresetFile(file, preset);
    const first = await startPresetKernel({ home, homeFolder, preset, presetFolder: presetsDir, presetSource: { origin: 'home', file } });
    expect(await first.exec('kernel.extensions.install', { source }, userCall())).toEqual({ file, restartRequired: true });
    await first.close();
    const edited = presetSchema.parse(JSON.parse(readStoredFile(file)));
    const second = await startPresetKernel({ home, homeFolder, preset: edited, presetFolder: presetsDir, presetSource: { origin: 'home', file } });
    expect(await second.exec('notes.ping', {}, userCall())).toEqual({ answer: 'pong' });
    expect(await second.exec('kernel.extensions.uninstall', { name: '@test/notes' }, userCall())).toEqual({ file, restartRequired: true });
    await second.close();
    const editedAgain = presetSchema.parse(JSON.parse(readStoredFile(file)));
    const third = await startPresetKernel({
      home,
      homeFolder,
      preset: editedAgain,
      presetFolder: presetsDir,
      presetSource: { origin: 'home', file },
    });
    try {
      await expect(third.exec('notes.ping', {}, userCall())).rejects.toMatchObject({ problem: { code: 'NOT_FOUND' } });
    } finally {
      await third.close();
    }
  });
});
