import { describe, expect, it } from 'vitest';
import { api, outputOf } from '../support/api.ts';
import { spawnKvman, type KvmanChild } from '../support/kvman-child.ts';
import { startRegistry } from '../support/npm-registry.ts';
import { useSandbox, type Sandbox } from '../support/sandbox.ts';
import { notesProject } from '../restart/support.ts';
import { closeInput, linesOf, nthLine, pipedArguments, portOf, send } from './support.ts';

const sandbox = useSandbox();

const helloVersion = { name: '@acme/hello', version: '1.0.0', source: 'npm:1.0.0' };

async function helloWorld(): Promise<{ world: Sandbox; start(extra?: readonly string[]): KvmanChild }> {
  const world = sandbox();
  const registry = await startRegistry(world, [{ name: '@acme/hello', namespace: 'hello', version: '1.0.0' }]);
  world.track(registry.close);
  const preset = world.writePreset('hello.json', { name: 'hello', extensions: { '@acme/hello': 'npm:1.0.0' }, settings: { 'kernel.web.home': 'hello', 'kernel.workers': 1 } });
  return { world, start: (extra = []) => spawnKvman(world, [...pipedArguments(world), '--preset', preset, ...extra], { defaults: false, env: registry.env }) };
}

// A piped kvman on the app preset with no `--yes`, past the question about the app extension itself, with an edit that
// adds the notes project and a restart asked for. It resolves at the question about the notes project.
async function restartedWithNotes(world: Sandbox): Promise<{ kvman: KvmanChild; port: number }> {
  const kvman = spawnKvman(world, [...pipedArguments(world), '--preset', world.appPreset()], { defaults: false });
  expect(await nthLine(kvman, 1)).toMatchObject({ kind: 'trust', versions: [{ name: '@test/app' }] });
  send(kvman, '{"trust":true}');
  const port = portOf(await nthLine(kvman, 2));
  await api(port).command('kernel.extensions.install', { source: `path:${notesProject(world)}` });
  await api(port).command('kernel.restart', {});
  expect(await nthLine(kvman, 4)).toMatchObject({ kind: 'trust', language: 'en', versions: [{ name: '@test/notes', version: '1.0.0' }] });
  return { kvman, port };
}

describe('the trust question of a piped run (02 §2.9, 14 §14.2)', { timeout: 180_000 }, () => {
  it('M3.1-H4 an unaccepted version writes a trust line, and { "trust": true } loads and remembers it', async () => {
    const { start } = await helloWorld();
    const first = start();
    expect(await nthLine(first, 1)).toEqual({ kind: 'trust', language: 'en', versions: [helloVersion] });
    send(first, '{"trust":true}');
    const port = portOf(await nthLine(first, 2));
    expect(outputOf(await api(port).query('hello.version', {}))).toBe('1.0.0');
    closeInput(first);
    expect(await first.exit).toBe(0);
    const second = start();
    expect(await nthLine(second, 1)).toMatchObject({ kind: 'running' });
    closeInput(second);
    expect(await second.exit).toBe(0);
    expect(linesOf(second)).toHaveLength(1);
  });

  it('M3.1-H5 { "trust": false }, any other line, and a closed input decline', async () => {
    const { start } = await helloWorld();
    const decline = [(kvman: KvmanChild) => send(kvman, '{"trust":false}'), (kvman: KvmanChild) => send(kvman, 'y'), closeInput];
    for (const answer of decline) {
      const kvman = start();
      expect(await nthLine(kvman, 1)).toEqual({ kind: 'trust', language: 'en', versions: [helloVersion] });
      answer(kvman);
      expect(await kvman.exit).toBe(1);
      expect(linesOf(kvman)).toHaveLength(2);
      expect(linesOf(kvman)[1]).toEqual({ kind: 'failed', language: 'en', problem: expect.objectContaining({ code: 'EXTENSION_INVALID', message: expect.stringContaining('@acme/hello@1.0.0') }) });
    }
  });

  it('M3.1-H6 --yes writes no trust line', async () => {
    const { start } = await helloWorld();
    const kvman = start(['--yes']);
    const port = portOf(await nthLine(kvman, 1));
    expect(outputOf(await api(port).query('hello.version', {}))).toBe('1.0.0');
    closeInput(kvman);
    expect(await kvman.exit).toBe(0);
    expect(linesOf(kvman).map((line) => line.kind)).toEqual(['running']);
  });

  it('M3.1-E11 a decline at a restart undoes the edit, with no failed line', async () => {
    const world = sandbox();
    const { kvman } = await restartedWithNotes(world);
    send(kvman, '{"trust":false}');
    const port = portOf(await nthLine(kvman, 5));
    expect(linesOf(kvman).map((line) => line.kind)).toEqual(['trust', 'running', 'restarting', 'trust', 'running']);
    expect(outputOf(await api(port).query('kernel.health.get', {}))).toMatchObject({ rolledBack: { code: 'EXTENSION_INVALID' } });
    expect(outputOf(await api(port).query('kernel.preset.get', {}))).toMatchObject({ extensions: expect.not.objectContaining({ '@test/notes': expect.anything() }) });
    closeInput(kvman);
    expect(await kvman.exit).toBe(0);
  });

  it('M3.1-E12 an accepted answer at a restart loads the extension', async () => {
    const world = sandbox();
    const { kvman } = await restartedWithNotes(world);
    send(kvman, '{"trust":true}');
    const port = portOf(await nthLine(kvman, 5));
    expect(linesOf(kvman).map((line) => line.kind)).toEqual(['trust', 'running', 'restarting', 'trust', 'running']);
    expect(outputOf(await api(port).query('notes.ping', {}))).toEqual({ text: 'pong' });
    closeInput(kvman);
    expect(await kvman.exit).toBe(0);
  });
});
