import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Preset } from '@kvman/sdk';
import { openDatabase } from '../../src/storage/database.ts';
import { makeRoot, startPresetKernel, userCall, writePresetFile } from './support.ts';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('an edit never loads, installs, or trusts (02 §2.10, ADR 0010, 5)', () => {
  it('QA17-E7 an npm install edits only the file: no folder, no list change, no trust row', async () => {
    const { home, homeFolder } = makeRoot(roots);
    const file = path.join(home, 'presets', 'mine.json');
    const preset: Preset = { name: 'mine', extensions: {}, settings: { 'kernel.workers': 1 } };
    writePresetFile(file, preset);
    const kernel = await startPresetKernel({ home, homeFolder, preset, presetFolder: path.dirname(file), presetSource: { origin: 'home', file } });
    try {
      expect(await kernel.exec('kernel.extensions.list', {}, userCall())).toEqual([]);
      expect(await kernel.exec('kernel.extensions.install', { name: '@acme/notes', source: 'npm:1.2.3' }, userCall())).toEqual({
        file,
        restartRequired: true,
      });
      expect(existsSync(path.join(home, 'extensions'))).toBe(false);
      expect(await kernel.exec('kernel.extensions.list', {}, userCall())).toEqual([]);
      const database = openDatabase(path.join(home, 'kvman.db'));
      try {
        expect(database.prepare('SELECT name, version, source FROM accepted_extensions').all()).toEqual([]);
      } finally {
        database.close();
      }
    } finally {
      await kernel.close();
    }
  });
});
