import { afterEach, describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import { kvmanWorld, type KvmanWorld } from '../support/kvman-child.ts';

let world: KvmanWorld | undefined;
afterEach(async () => {
  await world?.close();
  world = undefined;
});

const healthSchema = z.object({ preset: z.string() });
const extensionsSchema = z.array(z.object({ name: z.string(), source: z.string() }));
const settingsSchema = z.array(z.object({ key: z.string(), value: z.unknown(), source: z.string() }));

async function presetSettings(call: (route: 'queries', name: string, input: unknown) => Promise<unknown>, keys: readonly string[]) {
  const settings = settingsSchema.parse(await call('queries', 'kernel.settings.list', {}));
  return Object.fromEntries(keys.map((key) => [key, settings.find((setting) => setting.key === key)]));
}

describe('the bundled presets (11)', () => {
  it('M2.5-H3 kvman with no preset flag starts the coder preset', async () => {
    world = kvmanWorld();
    const kvman = await world.start([]);
    expect(healthSchema.parse(await kvman.call('queries', 'kernel.health.get', {})).preset).toBe('coder');
    expect(extensionsSchema.parse(await kvman.call('queries', 'kernel.extensions.list', {})).map((extension) => [extension.name, extension.source])).toEqual([
      ['@kvman/kvai', 'bundled'],
      ['@kvman/kvwebui', 'bundled'],
      ['@kvman/kvcoder', 'bundled'],
    ]);
    expect(await presetSettings(kvman.call, ['kvwebui.title', 'kvwebui.home', 'kvai.defaultModel'])).toEqual({
      'kvwebui.title': expect.objectContaining({ value: 'kvcoder.app.title', source: 'preset' }),
      'kvwebui.home': expect.objectContaining({ value: 'kvcoder.chat', source: 'preset' }),
      'kvai.defaultModel': expect.objectContaining({ value: 'anthropic/claude-sonnet-5-5', source: 'preset' }),
    });
  });

  it('M2.5-E39 kvman --preset dev loads kvdev too, with its title and shell approval', async () => {
    world = kvmanWorld();
    const kvman = await world.start(['--preset', 'dev']);
    expect(healthSchema.parse(await kvman.call('queries', 'kernel.health.get', {})).preset).toBe('dev');
    expect(extensionsSchema.parse(await kvman.call('queries', 'kernel.extensions.list', {})).map((extension) => extension.name)).toEqual(['@kvman/kvai', '@kvman/kvwebui', '@kvman/kvcoder', '@kvman/kvdev']);
    expect(await presetSettings(kvman.call, ['kvwebui.title', 'kvwebui.home', 'kvai.defaultModel', 'kvcoder.shell.approval'])).toEqual({
      'kvwebui.title': expect.objectContaining({ value: 'kvdev.app.title', source: 'preset' }),
      'kvwebui.home': expect.objectContaining({ value: 'kvcoder.chat', source: 'preset' }),
      'kvai.defaultModel': expect.objectContaining({ value: 'anthropic/claude-sonnet-5-5', source: 'preset' }),
      'kvcoder.shell.approval': expect.objectContaining({ value: 'ask', source: 'preset' }),
    });
  });
});
