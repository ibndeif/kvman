import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Json } from '@kvman/sdk';
import { kvmanWorld, type Kvman, type KvmanWorld } from '../support/kvman-child.ts';
import { manifest, writeIn } from '../support/kvcustomizer-kernel.ts';

// One kvman in the dev preset, where kvai, kvwebui, and kvcoder are bundled; each test writes its files into a folder
// of its own inside the workspace.
let world: KvmanWorld;
let kvman: Kvman;
beforeAll(async () => {
  world = kvmanWorld();
  kvman = await world.start(['--preset', 'dev']);
});
afterAll(() => world.close());

const base = { '@kvman/kvai': 'bundled', '@kvman/kvwebui': 'bundled', '@kvman/kvcoder': 'bundled' };
const failed = (code: string) => expect.objectContaining({ problem: expect.objectContaining({ code }) });
let round = 0;

async function check(preset: Json, files: Record<string, Json | string> = {}) {
  round += 1;
  const folder = `case-${String(round)}`;
  for (const [file, content] of Object.entries(files)) writeIn(world.project, path.join(folder, file), content);
  writeIn(world.project, path.join(folder, 'app.json'), preset);
  const findings = await kvman.call('commands', 'kvcustomizer.preset.check', { file: `${folder}/app.json` });
  return { findings, finding: (message: string | RegExp) => ({ file: `${folder}/app.json`, message: typeof message === 'string' ? message : expect.stringMatching(message), hint: expect.any(String) }) };
}

describe('preset new (09 §9.1, ADR 0009, 123)', () => {
  it('M2.5-E22 writes a runnable skeleton that passes preset check; an existing or outside file fails', async () => {
    expect(await kvman.call('commands', 'kvcustomizer.preset.new', { name: 'notes-app', file: 'presets/notes-app.json' })).toEqual({ file: 'presets/notes-app.json' });
    expect(JSON.parse(readFileSync(path.join(world.project, 'presets', 'notes-app.json'), 'utf8'))).toEqual({
      name: 'notes-app',
      extensions: { '@kvman/kvai': 'bundled', '@kvman/kvwebui': 'bundled' },
      settings: { 'kvwebui.home': 'kvwebui.extensions' },
    });
    expect(await kvman.call('commands', 'kvcustomizer.preset.check', { file: 'presets/notes-app.json' })).toEqual([]);
    await expect(kvman.call('commands', 'kvcustomizer.preset.new', { name: 'again', file: 'presets/notes-app.json' })).rejects.toEqual(failed('kvcustomizer/FILE_EXISTS'));
    await expect(kvman.call('commands', 'kvcustomizer.preset.new', { name: 'out', file: '../out.json' })).rejects.toEqual(failed('VALIDATION_FAILED'));
  });
});

describe('preset check (09 §9.1, ADR 0009, 122)', () => {
  it('M2.5-E23 the schema, bundled names, path: folders, and unreadable files are findings; npm: passes unfetched', async () => {
    const schema = await check({ name: 'app', extensions: base, colour: 'red' });
    expect(schema.findings).toEqual([schema.finding(/^preset: Unrecognized key/)]);
    const sources = await check({ name: 'app', extensions: { ...base, '@kvman/kvnope': 'bundled', '@me/gone': 'path:./gone', '@me/plain': 'path:./plain', '@acme/x': 'npm:1.2.3' } }, { 'plain/package.json': { name: '@me/plain', version: '1.0.0' } });
    expect(sources.findings).toEqual([
      sources.finding("@kvman/kvnope isn't a bundled extension."),
      sources.finding(/^@me\/gone: .*gone has no package\.json with a kvman field\.$/),
      sources.finding(/^@me\/plain: .*plain has no package\.json with a kvman field\.$/),
    ]);
    writeIn(world.project, 'broken.json', '{ not json');
    expect(await kvman.call('commands', 'kvcustomizer.preset.check', { file: 'broken.json' })).toEqual([{ file: 'broken.json', message: expect.stringMatching(/^The preset can't be read/), hint: expect.any(String) }]);
  });

  it('M2.5-E24 settings: a foreign namespace, an unregistered key, and a wrong value are findings; a path: extension key is not checked', async () => {
    const settings = { 'other.x': 1, 'kvcoder.nope': true, 'kvcoder.maxSteps': 'x', 'mine.anything': 'ok', 'kernel.workers': 2, 'kvwebui.home': 'kvcoder.chat' };
    const result = await check({ name: 'app', extensions: { ...base, '@me/mine': 'path:./mine' }, settings }, { 'mine/package.json': manifest('@me/mine', 'mine') });
    expect(result.findings).toEqual([
      result.finding("other.x belongs to other, which isn't kernel or one of the preset's extensions."),
      result.finding("kvcoder.nope isn't a setting of kvcoder."),
      result.finding(/^kvcoder\.maxSteps: /),
    ]);
  });

  it('M2.5-E25 kvwebui.home must be a built-in page, a loaded page, or under an unloaded extension', async () => {
    const unknown = await check({ name: 'app', extensions: base, settings: { 'kvwebui.home': 'kvcoder.nowhere' } });
    expect(unknown.findings).toEqual([unknown.finding("kvwebui.home kvcoder.nowhere isn't a page of kvcoder.")]);
    expect((await check({ name: 'app', extensions: base, settings: { 'kvwebui.home': 'kvwebui.extensions' } })).findings).toEqual([]);
    expect((await check({ name: 'app', extensions: base, settings: { 'kvwebui.home': 'kvcoder.chat' } })).findings).toEqual([]);
    expect((await check({ name: 'app', extensions: { ...base, '@me/mine': 'path:./mine' }, settings: { 'kvwebui.home': 'mine.hello' } }, { 'mine/package.json': manifest('@me/mine', 'mine') })).findings).toEqual([]);
  });
});
