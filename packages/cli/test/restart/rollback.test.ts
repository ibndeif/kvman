import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { presetSchema, type Preset } from '@kvman/sdk';
import { api, outputOf } from '../support/api.ts';
import { runKvman, startKvman, stopKvman } from '../support/kvman-child.ts';
import { useSandbox, type Sandbox } from '../support/sandbox.ts';
import { brokenProject, nthPort } from './support.ts';

const sandbox = useSandbox();

const stored = (file: string): Preset => presetSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
const undone = 'The last change to the preset was undone.';

// The app preset and a backup of it, as the first edit would have left them, with `changed` in the preset file.
function withBackup(world: Sandbox, change: (preset: Preset) => Preset): { file: string; good: Preset } {
  const file = world.appPreset();
  const good = stored(file);
  writeFileSync(`${file}.good`, JSON.stringify(good));
  writeFileSync(file, JSON.stringify(change(good)));
  return { file, good };
}

const withBroken = (world: Sandbox) => (preset: Preset): Preset => ({ ...preset, extensions: { ...preset.extensions, '@test/broken': `path:${brokenProject(world)}` } });

describe('a start that fails because of the preset is undone (02 §2.14, ADR 0024, 4 to 6)', { timeout: 120_000 }, () => {
  it('QA36-H8 and QA36-H9 a restart with an invalid extension puts the preset back, runs, and says so only for that start', async () => {
    const world = sandbox();
    const file = world.appPreset();
    const before = stored(file);
    const kvman = await startKvman(world, ['--preset', file]);
    await api(kvman.port).command('kernel.extensions.install', { source: `path:${brokenProject(world)}` });
    await api(kvman.port).command('kernel.restart', {});

    const port = await nthPort(kvman, 2);
    expect(kvman.errors()).toContain('EXTENSION_INVALID:');
    expect(kvman.errors()).toContain(undone);
    expect(stored(file)).toEqual(before);
    expect(existsSync(`${file}.good`)).toBe(false);
    expect(outputOf(await api(port).query('kernel.health.get', {}))).toMatchObject({ rolledBack: { code: 'EXTENSION_INVALID', message: expect.stringContaining('@test/broken') } });

    await api(port).command('kernel.restart', {});
    const again = await nthPort(kvman, 3);
    expect(outputOf(await api(again).query('kernel.health.get', {}))).not.toHaveProperty('rolledBack');
    expect(await stopKvman(kvman)).toBe(0);
  });

  it('QA36-E5 a setting that no extension registers is undone too', async () => {
    const world = sandbox();
    const { file, good } = withBackup(world, (preset) => ({ ...preset, settings: { ...preset.settings, 'nobody.nothing': 1 } }));
    const kvman = await startKvman(world, ['--preset', file]);
    expect(kvman.errors()).toContain('VALIDATION_FAILED:');
    expect(kvman.errors()).toContain(undone);
    expect(stored(file)).toEqual(good);
    expect(outputOf(await api(kvman.port).query('kernel.health.get', {}))).toMatchObject({ rolledBack: { code: 'VALIDATION_FAILED' } });
    expect(await stopKvman(kvman)).toBe(0);
  });

  it('QA36-E6 a start that refuses a new extension, with no terminal and no --yes, is undone', async () => {
    const world = sandbox();
    const file = world.appPreset();
    const good = stored(file);
    await stopKvman(await startKvman(world, ['--preset', file]));
    const notes = world.writeExtension({ name: '@test/notes', namespace: 'notes', entry: 'export default () => undefined;' });
    writeFileSync(`${file}.good`, JSON.stringify(good));
    writeFileSync(file, JSON.stringify({ ...good, extensions: { ...good.extensions, '@test/notes': `path:${notes}` } }));
    const kvman = await startKvman(world, ['--home', world.home, '--port', '0', '--no-open', '--preset', file], { defaults: false });
    expect(kvman.errors()).toContain("EXTENSION_INVALID: These extension versions weren't accepted: @test/notes@1.0.0");
    expect(kvman.errors()).toContain(undone);
    expect(stored(file)).toEqual(good);
    expect(await stopKvman(kvman)).toBe(0);
  });

  it('QA36-E3 with no backup, a failed start exits 1 with its Problem as before', async () => {
    const world = sandbox();
    const file = world.appPreset();
    writeFileSync(file, JSON.stringify(withBroken(world)(stored(file))));
    const failed = await runKvman(world, ['--preset', file]);
    expect(failed.code).toBe(1);
    expect(failed.errors).toContain('EXTENSION_INVALID:');
    expect(failed.errors).not.toContain(undone);
  });

  it('QA36-E4 a backup that fails too exits 1 with the second Problem, and doesn\'t try again', async () => {
    const world = sandbox();
    const file = world.appPreset();
    const broken = withBroken(world)(stored(file));
    writeFileSync(`${file}.good`, JSON.stringify(broken));
    writeFileSync(file, JSON.stringify({ ...broken, settings: { ...broken.settings, 'nobody.nothing': 1 } }));
    const failed = await runKvman(world, ['--preset', file]);
    expect(failed.code).toBe(1);
    expect(failed.errors.match(/EXTENSION_INVALID:/g)).toHaveLength(2);
    expect(failed.errors).toContain(undone);
    expect(existsSync(`${file}.good`)).toBe(false);
  });

  it('QA36-E2 a taken port is not undone: kvman exits 1 and the preset and its backup stay', async () => {
    const world = sandbox();
    const { file } = withBackup(world, (preset) => preset);
    const taken = createServer();
    await new Promise<void>((resolve) => taken.listen(0, '127.0.0.1', resolve));
    world.track(() => new Promise<void>((resolve) => taken.close(() => resolve())));
    const address = taken.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;
    const failed = await runKvman(world, ['--home', world.home, '--no-open', '--yes', '--preset', file, '--port', String(port)], { defaults: false });
    expect(failed.code).toBe(1);
    expect(failed.errors).toContain('PORT_IN_USE:');
    expect(failed.errors).not.toContain(undone);
    expect(existsSync(path.join(`${file}.good`))).toBe(true);
  });
});
