import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import { presetBin, startPresetWorld, writeJsonFile, writeTextFile, type PresetWorld } from '../support/preset-world.ts';

// `kvman-preset new` against a real kvman child running the bundled extensions (09 §9.1, ADR 0010, 20): one child for
// the file's checks, and each test writes into a folder of its own, running the bin there.
let world: PresetWorld;
beforeAll(async () => {
  world = await startPresetWorld();
});
afterAll(async () => {
  await world.stop();
});

const skeleton = { name: 'mine', extensions: { '@kvman/kvai': 'bundled', '@kvman/kvwebui': 'bundled' }, settings: { 'kvwebui.home': 'kvwebui.extensions' } };

const failureSchema = z.object({ code: z.string(), message: z.string(), params: z.record(z.string(), z.json()).optional() });

describe('kvman-preset new and check together (09 §9.1, ADR 0010, 20)', () => {
  it('QA17-H12 new --json writes the skeleton, and check --json of it prints []', async () => {
    const folder = world.nextCase();
    const created = await presetBin(['new', './presets/mine.json', '--name', 'mine', '--json'], folder);
    expect(created.exitCode).toBe(0);
    expect(created.stderr).toBe('');
    expect(created.stdout.trim().split('\n')).toHaveLength(1);
    expect(JSON.parse(created.stdout)).toEqual({ file: path.join(folder, 'presets', 'mine.json') });
    expect(readFileSync(path.join(folder, 'presets', 'mine.json'), 'utf8')).toBe(`${JSON.stringify(skeleton, null, 2)}\n`);
    const checked = await presetBin(['check', 'presets/mine.json', '--home', world.home, '--json'], folder);
    expect(checked.exitCode).toBe(0);
    expect(checked.stderr).toBe('');
    expect(checked.stdout.trim().split('\n')).toHaveLength(1);
    expect(JSON.parse(checked.stdout)).toEqual([]);
  });

  it('QA17-H12 new and a clean check print their human lines', async () => {
    const folder = world.nextCase();
    const created = await presetBin(['new', './presets/mine.json', '--name', 'mine'], folder);
    expect(created.exitCode).toBe(0);
    expect(created.stderr).toBe('');
    expect(created.stdout).toBe('Wrote ./presets/mine.json.\n');
    const checked = await presetBin(['check', 'presets/mine.json', '--home', world.home], folder);
    expect(checked.exitCode).toBe(0);
    expect(checked.stderr).toBe('');
    expect(checked.stdout).toBe('No findings.\n');
  });

  it('QA17-H12 check of a preset with several problems prints one finding each and exits 1', async () => {
    const folder = world.nextCase();
    const file = 'app.json';
    const bundled = { '@kvman/kvai': 'bundled', '@kvman/kvwebui': 'bundled', '@kvman/kvcoder': 'bundled', '@kvman/kvnope': 'bundled' };
    writeJsonFile(folder, file, { name: 'app', extensions: bundled, settings: { 'other.x': 1, 'kvwebui.home': 'kvcoder.nowhere' } });
    const checked = await presetBin(['check', file, '--home', world.home, '--json'], folder);
    expect(checked.exitCode).toBe(1);
    expect(checked.stderr).toBe('');
    expect(checked.stdout.trim().split('\n')).toHaveLength(1);
    expect(JSON.parse(checked.stdout)).toEqual([
      { file, message: "@kvman/kvnope isn't a bundled extension.", hint: expect.any(String) },
      { file, message: "other.x belongs to other, which isn't kernel or one of the preset's extensions.", hint: expect.any(String) },
      { file, message: "kvwebui.home kvcoder.nowhere isn't a page of kvcoder.", hint: expect.any(String) },
    ]);
  });
});

describe('kvman-preset new rules (09 §9.1, ADR 0010, 20)', () => {
  it('QA17-E36 new of an existing file fails FILE_EXISTS and leaves it unchanged', async () => {
    const folder = world.nextCase();
    writeTextFile(folder, 'app.json', '{"kept":true}');
    const json = await presetBin(['new', 'app.json', '--name', 'mine', '--json'], folder);
    expect(json.exitCode).toBe(1);
    expect(json.stdout).toBe('');
    expect(json.stderr.trim().split('\n')).toHaveLength(1);
    expect(failureSchema.parse(JSON.parse(json.stderr))).toEqual({
      code: 'FILE_EXISTS',
      message: 'app.json already exists; choose another file.',
      params: { file: 'app.json' },
    });
    const human = await presetBin(['new', 'app.json', '--name', 'mine'], folder);
    expect(human.exitCode).toBe(1);
    expect(human.stdout).toBe('');
    expect(human.stderr).toBe('error: app.json already exists; choose another file.\n');
    expect(readFileSync(path.join(folder, 'app.json'), 'utf8')).toBe('{"kept":true}');
  });

  it('QA17-E36 new without a name, with an empty name, without a file, or with an extra argument fails VALIDATION_FAILED and writes nothing', async () => {
    const cases: string[][] = [['new', './x.json'], ['new', './x.json', '--name', ''], ['new', '--name', 'mine'], ['new', './a.json', './b.json', '--name', 'mine']];
    for (const args of cases) {
      const folder = world.nextCase();
      const run = await presetBin([...args, '--json'], folder);
      expect(run.exitCode).toBe(1);
      expect(run.stdout).toBe('');
      expect(run.stderr.trim().split('\n')).toHaveLength(1);
      expect(failureSchema.parse(JSON.parse(run.stderr)).code).toBe('VALIDATION_FAILED');
      expect(readdirSync(folder)).toEqual([]);
    }
  });
});
