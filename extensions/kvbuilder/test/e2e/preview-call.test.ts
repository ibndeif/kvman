import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import { callKvman, builderPreset, kvmanWorld, type Kvman, type KvmanWorld } from '../support/kvman-child.ts';
import { statusSchema, writeProject } from '../support/preview-world.ts';

let world: KvmanWorld;
let kvman: Kvman;
beforeAll(async () => {
  world = kvmanWorld();
  kvman = await world.start(['--preset', builderPreset(world)]);
  writeProject(world.project, 'notes', 'notes');
});
afterAll(() => world.close());
afterEach(async () => {
  if (statusSchema.parse(await kvman.call('queries', 'kvbuilder.preview.status', {})).running) await kvman.call('commands', 'kvbuilder.preview.stop', {});
});

const settingsSchema = z.array(z.object({ key: z.string(), value: z.unknown(), source: z.string() }));
const themeOf = (settings: unknown) => settingsSchema.parse(settings).find((setting) => setting.key === 'kvwebui.theme');

describe('calling a previewed project (09 §9.3, ADR 0022, 8 and 14)', () => {
  it("QA34-H11 query-get and command-run run in the preview, not in the app that started it", async () => {
    const { url } = z.object({ url: z.string() }).parse(await kvman.call('commands', 'kvbuilder.preview.start', { extensions: ['notes'] }));
    expect(await kvman.call('queries', 'kvbuilder.preview.query.get', { name: 'notes.greeting.get' })).toEqual({ ok: true, output: { text: 'Hello from notes!' } });

    const appBefore = themeOf(await kvman.call('queries', 'kernel.settings.list', {}));
    expect(await kvman.call('commands', 'kvbuilder.preview.command.run', { name: 'kernel.settings.set', input: { key: 'kvwebui.theme', value: 'dark', scope: 'global' } })).toEqual({ ok: true, output: {} });
    expect(themeOf(await callKvman(new URL(url).origin, 'queries', 'kernel.settings.list', {}))).toMatchObject({ value: 'dark', source: 'global' });
    expect(themeOf(await kvman.call('queries', 'kernel.settings.list', {}))).toEqual(appBefore);
  });

  it('QA34-E15 a call that fails in the preview is answered as data', async () => {
    await kvman.call('commands', 'kvbuilder.preview.start', { extensions: ['notes'] });
    expect(await kvman.call('queries', 'kvbuilder.preview.query.get', { name: 'nobody.nothing.get' })).toEqual({ ok: false, problem: expect.objectContaining({ code: 'NOT_FOUND', message: expect.any(String) }) });
    expect(await kvman.call('commands', 'kvbuilder.preview.command.run', { name: 'notes.greeting.get' })).toEqual({ ok: false, problem: expect.objectContaining({ code: 'NOT_FOUND' }) });
    expect(await kvman.call('commands', 'kvbuilder.preview.command.run', { name: 'kernel.settings.set', input: { key: 'nobody.nothing', value: 1, scope: 'global' } })).toEqual({ ok: false, problem: expect.objectContaining({ code: 'NOT_FOUND' }) });
  });
});
