import { existsSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import { callKvman, customizerPreset, kvmanWorld, until, type Kvman, type KvmanWorld } from '../support/kvman-child.ts';
import { writeIn } from '../support/kvcustomizer-kernel.ts';
import { alive, holdPorts, kvcustomizerProcesses, previewHomeOf, statusSchema, writeProject } from '../support/preview-world.ts';

let world: KvmanWorld;
let kvman: Kvman;
beforeAll(async () => {
  world = kvmanWorld();
  kvman = await world.start(['--preset', customizerPreset(world)]);
  writeProject(world.project, 'notes', 'notes');
});
afterAll(() => world.close());
afterEach(async () => {
  if (statusSchema.parse(await kvman.call('queries', 'kvcustomizer.preview.status', {})).running) await kvman.call('commands', 'kvcustomizer.preview.stop', {});
});

const urlSchema = z.object({ url: z.string() });
const failed = (code: string) => expect.objectContaining({ problem: expect.objectContaining({ code }) });
const start = async (extensions: string[] = ['notes']) => urlSchema.parse(await kvman.call('commands', 'kvcustomizer.preview.start', { extensions })).url;
const status = async () => statusSchema.parse(await kvman.call('queries', 'kvcustomizer.preview.status', {}));

describe('the preview (09 §9.3, ADR 0009, 119, 124–126)', () => {
  it('M2.5-E26 start answers once the preview runs, with its generated preset, its home, and the Extensions page as home', async () => {
    const url = await start();
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:(\d+)\/$/);
    expect(Number(new URL(url).port)).toBeGreaterThanOrEqual(3738);
    expect(await status()).toEqual({ running: true, url, extensions: ['notes'], startedAt: expect.any(String) });
    const origin = new URL(url).origin;
    expect(await callKvman(origin, 'queries', 'kernel.health.get', {})).toMatchObject({ preset: 'preview' });
    const extensions = z.array(z.object({ name: z.string(), source: z.string() })).parse(await callKvman(origin, 'queries', 'kernel.extensions.list', {}));
    expect(extensions.map((extension) => extension.name)).toEqual(['@kvman/kvai', '@kvman/kvwebui', 'notes']);
    const settings = z.array(z.object({ key: z.string(), value: z.unknown() })).parse(await callKvman(origin, 'queries', 'kernel.settings.list', {}));
    expect(settings.find((setting) => setting.key === 'kvwebui.home')?.value).toBe('kvwebui.extensions');
    expect(existsSync(previewHomeOf(kvman))).toBe(true);
  });

  it('M2.5-E27 a second start fails PROCESS_RUNNING; stop removes the home; another stop fails NOT_FOUND', async () => {
    await start();
    await expect(start()).rejects.toEqual(failed('PROCESS_RUNNING'));
    expect(await kvman.call('commands', 'kvcustomizer.preview.stop', {})).toEqual({});
    expect(existsSync(previewHomeOf(kvman))).toBe(false);
    expect(await status()).toEqual({ running: false });
    await expect(kvman.call('commands', 'kvcustomizer.preview.stop', {})).rejects.toEqual(failed('NOT_FOUND'));
  });

  it('M2.5-E28 a taken 3738 moves the preview on; with 3738–3837 all taken, kvcustomizer/NO_FREE_PORT', async () => {
    const releaseFirst = await holdPorts([3738]);
    try {
      expect(Number(new URL(await start()).port)).toBeGreaterThan(3738);
      await kvman.call('commands', 'kvcustomizer.preview.stop', {});
    } finally {
      await releaseFirst();
    }
    const releaseAll = await holdPorts(Array.from({ length: 100 }, (_, index) => 3738 + index));
    try {
      await expect(start()).rejects.toEqual(failed('kvcustomizer/NO_FREE_PORT'));
    } finally {
      await releaseAll();
    }
  });

  it('M2.5-E29 a preview that exits by itself is cleaned up', async () => {
    await start();
    const preview = (await kvcustomizerProcesses(kvman)).find((process) => process.name === 'preview');
    process.kill(preview?.pid ?? 0, 'SIGKILL');
    await until(status, statusSchema, (current) => !current.running);
    await until(async () => existsSync(previewHomeOf(kvman)), z.boolean(), (exists) => !exists);
    expect(await kvcustomizerProcesses(kvman)).toEqual([]);
  });

  it('M2.5-E30 a project the preview cannot load fails kvcustomizer/PREVIEW_FAILED with its log, and nothing keeps running', async () => {
    writeProject(world.project, 'broken', 'broken');
    writeIn(world.project, 'broken/src/index.ts', "export default (ctx) => { ctx.registerQuery('elsewhere.x', {}); };\n");
    const error: unknown = await start(['broken']).catch((thrown: unknown) => thrown);
    expect(error).toEqual(failed('kvcustomizer/PREVIEW_FAILED'));
    expect(error).toEqual(expect.objectContaining({ problem: expect.objectContaining({ message: expect.stringContaining('EXTENSION_INVALID') }) }));
    expect(await kvcustomizerProcesses(kvman)).toEqual([]);
    expect(await status()).toEqual({ running: false });
  });
});

describe('the preview and the main kvman (09 §9.3)', () => {
  it('M2.5-E31 the preview stops with the main kvman', async () => {
    const own = kvmanWorld();
    try {
      const main = await own.start(['--preset', customizerPreset(own)]);
      writeProject(own.project, 'notes', 'notes');
      await main.call('commands', 'kvcustomizer.preview.start', { extensions: ['notes'] });
      const preview = (await kvcustomizerProcesses(main)).find((process) => process.name === 'preview');
      expect(alive(preview?.pid ?? 0)).toBe(true);
      await main.stop();
      expect(alive(preview?.pid ?? 0)).toBe(false);
    } finally {
      await own.close();
    }
  });
});
