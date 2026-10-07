import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { homeWorkspaceId, startKernel } from '@kvman/kernel';
import type { Preset } from '@kvman/sdk';
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

describe('finding the preset (01 §1.2, ADR 0010, 4)', () => {
  it("M1.8-H4 a person's preset replaces a bundled one of the same name", () => {
    const where = folders();
    write(path.join(where.bundled, 'same.json'), { name: 'same', extensions: {} });
    const own = path.join(where.home, 'presets', 'same.json');
    write(own, { name: 'mine', extensions: {} });
    expect(findPreset('same', where)).toEqual({ preset: { name: 'mine', extensions: {} }, presetFolder: path.dirname(own), source: { origin: 'home', file: own } });
  });

  it('M1.8-E11 a bundled name and a home name are each found, with their folder as the preset folder', () => {
    const where = folders();
    write(path.join(where.bundled, 'coder.json'), { name: 'coder', extensions: {} });
    const own = path.join(where.home, 'presets', 'mine.json');
    write(own, { name: 'my own', extensions: {}, settings: { 'kernel.workers': 2 } });
    expect(findPreset('coder', where)).toEqual({ preset: { name: 'coder', extensions: {} }, presetFolder: where.bundled, source: { origin: 'bundled' } });
    expect(findPreset('mine', where)).toEqual({
      preset: { name: 'my own', extensions: {}, settings: { 'kernel.workers': 2 } },
      presetFolder: path.join(where.home, 'presets'),
      source: { origin: 'home', file: own },
    });
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
    const file = path.join(where.start, 'a', 'p.json');
    expect(findPreset('./a/p.json', where)).toEqual({ preset: { name: 'nested', extensions: {} }, presetFolder: path.join(where.start, 'a'), source: { origin: 'file', file } });
  });

  it("QA17-H7 a home file named like a bundled preset is the preset, and the bundled file is not read", () => {
    const where = folders();
    write(path.join(where.bundled, 'coder.json'), '{ broken');
    const own = path.join(where.home, 'presets', 'coder.json');
    write(own, { name: 'coder', extensions: {}, settings: { 'kernel.workers': 1 } });
    expect(findPreset('coder', where)).toEqual({
      preset: { name: 'coder', extensions: {}, settings: { 'kernel.workers': 1 } },
      presetFolder: path.dirname(own),
      source: { origin: 'home', file: own },
    });
  });

  it("QA17-E10 an unknown name fails VALIDATION_FAILED, a file gives a file source, and a bundled name gives a bundled source", () => {
    const where = folders();
    expect(() => findPreset('nope', where)).toThrow(failed);
    expect(() => findPreset('nope', where)).toThrow('neither a bundled one nor');
    write(path.join(where.start, 'file.json'), { name: 'from file', extensions: {} });
    const file = path.join(where.start, 'file.json');
    expect(findPreset('./file.json', where)).toEqual({
      preset: { name: 'from file', extensions: {} },
      presetFolder: where.start,
      source: { origin: 'file', file },
    });
    write(path.join(where.bundled, 'coder.json'), { name: 'coder', extensions: {} });
    expect(findPreset('coder', where)).toEqual({ preset: { name: 'coder', extensions: {} }, presetFolder: where.bundled, source: { origin: 'bundled' } });
  });

  it('QA42-H10 a preset saved by kernel.presets.save is found by its name, with the saved file', async () => {
    const where = folders();
    const homeFolder = path.join(path.dirname(where.home), 'home-folder');
    mkdirSync(homeFolder, { recursive: true });
    const running: Preset = { name: 'first', extensions: {}, settings: { 'kernel.workers': 1 } };
    const kernel = await startKernel({
      home: where.home,
      homeFolder,
      preset: running,
      presetFolder: where.bundled,
      bundled: new Map(),
      mode: 'web',
      logLevel: 'error',
      terminalLog: false,
      startFolder: where.start,
      trust: () => Promise.resolve(true),
    });
    const second: Preset = { name: 'second', extensions: {}, settings: { 'kernel.workers': 1 } };
    try {
      await kernel.exec('kernel.presets.save', { preset: second }, { caller: { kind: 'user' }, workspaceId: homeWorkspaceId });
    } finally {
      await kernel.close();
    }
    const file = path.join(where.home, 'presets', 'second.json');
    expect(findPreset('second', where)).toEqual({ preset: second, presetFolder: path.dirname(file), source: { origin: 'home', file } });
  });
});
