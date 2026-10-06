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
  it('M2.5-H3, QA4-H13 and QA17-H18 kvman with no preset flag starts the coder preset, with kvcustomizer, and its shell approval is the default auto', async () => {
    world = kvmanWorld();
    const kvman = await world.start([]);
    expect(healthSchema.parse(await kvman.call('queries', 'kernel.health.get', {})).preset).toBe('coder');
    expect(extensionsSchema.parse(await kvman.call('queries', 'kernel.extensions.list', {})).map((extension) => [extension.name, extension.source])).toEqual([
      ['@kvman/kvai', 'bundled'],
      ['@kvman/kvwebui', 'bundled'],
      ['@kvman/kvcoder', 'bundled'],
      ['@kvman/kvcustomizer', 'bundled'],
    ]);
    expect(await presetSettings(kvman.call, ['kvwebui.title', 'kvwebui.home', 'kvai.defaultModel', 'kvcoder.shell.approval'])).toEqual({
      'kvwebui.title': expect.objectContaining({ value: 'kvcoder.app.title', source: 'preset' }),
      'kvwebui.home': expect.objectContaining({ value: 'kvcoder.chat', source: 'preset' }),
      'kvai.defaultModel': expect.objectContaining({ value: 'anthropic/claude-sonnet-5-5', source: 'preset' }),
      'kvcoder.shell.approval': expect.objectContaining({ value: 'auto', source: 'default' }),
    });
    const connectors = z.array(z.object({ name: z.string(), owner: z.string() })).parse(await kvman.call('queries', 'kvcoder.connector.list', {}));
    expect(connectors.filter((connector) => connector.owner === '@kvman/kvcustomizer').map((connector) => connector.name).sort()).toEqual(['docs', 'ext', 'kvman', 'preset', 'preview']);
  });
});
