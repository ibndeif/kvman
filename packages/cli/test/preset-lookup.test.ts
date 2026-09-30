import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { findPreset, isPresetFile, type PresetFolders } from '../src/preset-lookup.ts';

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function folders(): PresetFolders {
  const root = mkdtempSync(path.join(tmpdir(), 'kvman-presets-'));
  roots.push(root);
  const found = { bundled: path.join(root, 'bundled'), home: path.join(root, 'home'), start: path.join(root, 'start') };
  for (const folder of [found.bundled, path.join(found.home, 'presets'), found.start]) mkdirSync(folder, { recursive: true });
  return found;
}

function write(file: string, content: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
}

const failed = expect.objectContaining({ problem: expect.objectContaining({ code: 'VALIDATION_FAILED' }) });

describe('finding the preset (01 §1.2, ADR 0009, 45)', () => {
  it('M1.8-H4 a name that is both bundled and in <home>/presets/ fails VALIDATION_FAILED', () => {
    const where = folders();
    write(path.join(where.bundled, 'same.json'), { name: 'same', extensions: {} });
    write(path.join(where.home, 'presets', 'same.json'), { name: 'same', extensions: {} });
    expect(() => findPreset('same', where)).toThrow(failed);
    expect(() => findPreset('same', where)).toThrow('The preset name same is both bundled and in');
  });

  it('M1.8-E11 a bundled name and a home name are each found, with their folder as the preset folder', () => {
    const where = folders();
    write(path.join(where.bundled, 'coder.json'), { name: 'coder', extensions: {} });
    write(path.join(where.home, 'presets', 'mine.json'), { name: 'my own', extensions: {}, settings: { 'kernel.workers': 2 } });
    expect(findPreset('coder', where)).toEqual({ preset: { name: 'coder', extensions: {} }, presetFolder: where.bundled });
    expect(findPreset('mine', where)).toEqual({ preset: { name: 'my own', extensions: {}, settings: { 'kernel.workers': 2 } }, presetFolder: path.join(where.home, 'presets') });
  });

  it('M1.8-E12 an unknown name, a missing file, a file that is not JSON, and an invalid preset fail VALIDATION_FAILED', () => {
    const where = folders();
    write(path.join(where.start, 'broken.json'), '{ nope');
    write(path.join(where.start, 'invalid.json'), { name: 'x', extensions: {}, extra: true });
    for (const value of ['unknown', './missing.json', 'broken.json', 'invalid.json']) expect(() => findPreset(value, where), value).toThrow(failed);
  });

  it('M1.8-E13 a value with a separator or ending in .json is a file relative to the start folder; any other is a name', () => {
    expect(['./a/p.json', 'a\\p.json', 'p.json', '../p', 'p'].map(isPresetFile)).toEqual([true, true, true, true, false]);
    const where = folders();
    write(path.join(where.start, 'a', 'p.json'), { name: 'nested', extensions: {} });
    expect(findPreset('./a/p.json', where)).toEqual({ preset: { name: 'nested', extensions: {} }, presetFolder: path.join(where.start, 'a') });
  });
});
