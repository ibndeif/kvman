import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closedPort, presetBin, projectManifest, startPresetWorld, writeJsonFile, writeTextFile, type PresetWorld } from '../support/preset-world.ts';
import type { BinRun } from '../support/run-bin.ts';

// `kvman-preset check` against a real kvman child running the bundled extensions (09 §9.1, ADR 0010, 20): one child
// for the file's checks, and each test writes its preset files into a folder of its own, running the bin there, so a
// preset argument is a relative path like `app.json` and a finding's `file` is that same string.
let world: PresetWorld;
beforeAll(async () => {
  world = await startPresetWorld();
});
afterAll(async () => {
  await world.stop();
});

const bundled = { '@kvman/kvai': 'bundled', '@kvman/kvwebui': 'bundled', '@kvman/kvcoder': 'bundled' };

const notRunningLine = "kvman isn't running; only the preset's schema and path: folders were checked.\n";

function finding(file: string, message: string | RegExp) {
  return { file, message: typeof message === 'string' ? message : expect.stringMatching(message), hint: expect.stringMatching(/\S/) };
}

async function checkJson(folder: string, file: string, locate: readonly string[]): Promise<BinRun> {
  const run = await presetBin(['check', file, ...locate, '--json'], folder);
  expect(run.stdout.trim().split('\n')).toHaveLength(1);
  return run;
}

describe('kvman-preset check against a running kvman (09 §9.1, ADR 0010, 20)', () => {
  it('QA17-E32 the schema, bundled names, path: folders, and an unreadable file are findings; npm: passes unfetched', async () => {
    const folder = world.nextCase();
    writeJsonFile(folder, 'app.json', { name: 'app', extensions: bundled, colour: 'red' });
    const schema = await checkJson(folder, 'app.json', ['--home', world.home]);
    expect(schema.exitCode).toBe(1);
    expect(schema.stderr).toBe('');
    expect(JSON.parse(schema.stdout)).toEqual([finding('app.json', /^preset: Unrecognized key/)]);

    const sources = world.nextCase();
    writeJsonFile(sources, 'app.json', {
      name: 'app',
      extensions: { ...bundled, '@kvman/kvnope': 'bundled', '@me/gone': 'path:./gone', '@me/plain': 'path:./plain', '@acme/x': 'npm:1.2.3' },
    });
    writeJsonFile(sources, 'plain/package.json', { name: '@me/plain', version: '1.0.0' });
    const checked = await checkJson(sources, 'app.json', ['--home', world.home]);
    expect(checked.exitCode).toBe(1);
    expect(checked.stderr).toBe('');
    expect(JSON.parse(checked.stdout)).toEqual([
      finding('app.json', "@kvman/kvnope isn't a bundled extension."),
      finding('app.json', /^@me\/gone: .*gone has no package\.json with a kvman field\.$/),
      finding('app.json', /^@me\/plain: .*plain has no package\.json with a kvman field\.$/),
    ]);

    const broken = world.nextCase();
    writeTextFile(broken, 'broken.json', '{ not json');
    const unreadable = await checkJson(broken, 'broken.json', ['--home', world.home]);
    expect(unreadable.exitCode).toBe(1);
    expect(unreadable.stderr).toBe('');
    expect(JSON.parse(unreadable.stdout)).toEqual([finding('broken.json', /^The preset can't be read/)]);
  });

  it("QA17-E33 settings: a foreign namespace, an unregistered key, and a wrong value are findings; a path: extension's key is not checked", async () => {
    const folder = world.nextCase();
    writeJsonFile(folder, 'app.json', {
      name: 'app',
      extensions: { ...bundled, '@me/mine': 'path:./mine' },
      settings: { 'other.x': 1, 'kvcoder.nope': true, 'kvcoder.maxSteps': 'x', 'mine.anything': 'ok', 'kernel.workers': 2, 'kvwebui.home': 'kvcoder.chat' },
    });
    writeJsonFile(folder, 'mine/package.json', projectManifest('@me/mine', 'mine'));
    const run = await checkJson(folder, 'app.json', ['--home', world.home]);
    expect(run.exitCode).toBe(1);
    expect(run.stderr).toBe('');
    expect(JSON.parse(run.stdout)).toEqual([
      finding('app.json', "other.x belongs to other, which isn't kernel or one of the preset's extensions."),
      finding('app.json', "kvcoder.nope isn't a setting of kvcoder."),
      finding('app.json', /^kvcoder\.maxSteps: /),
    ]);
  });

  it("QA17-E34 kvwebui.home must be a built-in page, a loaded page, or under a path: extension's namespace", async () => {
    const folder = world.nextCase();
    writeJsonFile(folder, 'app.json', { name: 'app', extensions: bundled, settings: { 'kvwebui.home': 'kvcoder.nowhere' } });
    const unknown = await checkJson(folder, 'app.json', ['--home', world.home]);
    expect(unknown.exitCode).toBe(1);
    expect(unknown.stderr).toBe('');
    expect(JSON.parse(unknown.stdout)).toEqual([finding('app.json', "kvwebui.home kvcoder.nowhere isn't a page of kvcoder.")]);

    for (const home of ['kvwebui.extensions', 'kvwebui.settings', 'kvcoder.chat']) {
      const clean = world.nextCase();
      writeJsonFile(clean, 'app.json', { name: 'app', extensions: bundled, settings: { 'kvwebui.home': home } });
      const run = await checkJson(clean, 'app.json', ['--home', world.home]);
      expect(run.exitCode).toBe(0);
      expect(run.stderr).toBe('');
      expect(JSON.parse(run.stdout)).toEqual([]);
    }

    const unloaded = world.nextCase();
    writeJsonFile(unloaded, 'app.json', { name: 'app', extensions: { ...bundled, '@me/mine': 'path:./mine' }, settings: { 'kvwebui.home': 'mine.hello' } });
    writeJsonFile(unloaded, 'mine/package.json', projectManifest('@me/mine', 'mine'));
    const mine = await checkJson(unloaded, 'app.json', ['--home', world.home]);
    expect(mine.exitCode).toBe(0);
    expect(mine.stderr).toBe('');
    expect(JSON.parse(mine.stdout)).toEqual([]);
  });
});

describe('kvman-preset check with no running kvman (09 §9.1, ADR 0010, 19)', () => {
  it("QA17-E35 only the schema and the path: folders are checked, and stderr says so", async () => {
    const folder = world.nextCase();
    writeJsonFile(folder, 'app.json', {
      name: 'app',
      extensions: { '@kvman/kvai': 'bundled', '@kvman/kvnope': 'bundled', '@me/gone': 'path:./gone' },
      settings: { 'other.x': 1, 'kvwebui.home': 'kvcoder.nowhere' },
    });
    const broken = world.nextCase();
    writeJsonFile(broken, 'app.json', { name: 'app', colour: 'red', extensions: { '@me/gone': 'path:./gone' } });
    const emptyHome = world.nextCase();
    const port = await closedPort();
    const locates: (readonly string[])[] = [['--home', emptyHome], ['--url', `http://127.0.0.1:${String(port)}`]];
    for (const locate of locates) {
      const run = await checkJson(folder, 'app.json', locate);
      expect(run.exitCode).toBe(1);
      expect(run.stderr).toBe(notRunningLine);
      expect(JSON.parse(run.stdout)).toEqual([finding('app.json', /^@me\/gone: .*gone has no package\.json with a kvman field\.$/)]);
      const schema = await checkJson(broken, 'app.json', locate);
      expect(schema.exitCode).toBe(1);
      expect(schema.stderr).toBe(notRunningLine);
      expect(JSON.parse(schema.stdout)).toEqual([finding('app.json', /^preset: Unrecognized key/)]);
    }

    const clean = world.nextCase();
    writeJsonFile(clean, 'app.json', { name: 'app', extensions: { '@kvman/kvai': 'bundled' } });
    const ok = await checkJson(clean, 'app.json', ['--home', emptyHome]);
    expect(ok.exitCode).toBe(0);
    expect(ok.stderr).toBe(notRunningLine);
    expect(JSON.parse(ok.stdout)).toEqual([]);
  });
});
