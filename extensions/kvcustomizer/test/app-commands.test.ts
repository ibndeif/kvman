import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useKvcustomizer } from './support/kvcustomizer-kernel.ts';

const kvcustomizer = useKvcustomizer();
const failed = (code: string) => expect.objectContaining({ problem: expect.objectContaining({ code }) });
const appFolder = fileURLToPath(new URL('../src/app/', import.meta.url));

// A custom provider and one model: the only model of this test kernel that can be called.
async function withRelay() {
  const world = await kvcustomizer.start();
  await world.kernel.exec('kvai.provider.add', { id: 'relay', title: 'Relay', delegate: 'relay.complete' });
  await world.kernel.exec('kvai.model.add', { provider: 'relay', id: 'm1', name: 'M1', reasoning: false, input: ['text'], contextWindow: 1000, maxTokens: 100 });
  return world;
}

describe('the kvman connector\'s commands (09 §9.1, ADR 0010, 6 and 8)', { timeout: 60_000 }, () => {
  it('QA17-H17 the model, the settings, the extensions, and the preset are managed through the kernel', async () => {
    const { kernel } = await withRelay();
    expect(await kernel.exec('kvcustomizer.app.model.list', {})).toEqual([{ id: 'relay/m1', name: 'M1', provider: 'relay', isDefault: false }]);
    await kernel.exec('kvcustomizer.app.model.set', { model: 'relay/m1' });
    expect(await kernel.exec('kvcustomizer.app.model.list', {})).toEqual([{ id: 'relay/m1', name: 'M1', provider: 'relay', isDefault: true }]);
    const defaultModel = (await kernel.exec('kernel.settings.list', {})).find((setting) => setting.key === 'kvai.defaultModel');
    expect(defaultModel).toMatchObject({ value: 'relay/m1', source: 'global' });

    await kernel.exec('kvcustomizer.app.settings.set', { key: 'kvwebui.theme', value: 'dark', scope: 'global' });
    const theme = async () => (await kernel.exec('kvcustomizer.app.settings.list', {})).find((setting) => setting.key === 'kvwebui.theme');
    expect(await theme()).toMatchObject({ value: 'dark', source: 'global' });
    await kernel.exec('kvcustomizer.app.settings.reset', { key: 'kvwebui.theme', scope: 'global' });
    expect((await theme())?.source).not.toBe('global');

    const extensions = await kernel.exec('kvcustomizer.app.extensions.list', {});
    const own = extensions.find((extension) => extension.name === '@kvman/kvcustomizer');
    expect(own).toMatchObject({ namespace: 'kvcustomizer', source: expect.stringMatching(/^(bundled|path:)/) });
    expect(own?.commands).toContain('kvcustomizer.app.model.set');
    expect(own?.queries).toContain('kvcustomizer.guides.list');
    expect(JSON.stringify(extensions)).not.toContain('"schema"');

    const installed = await kernel.exec('kvcustomizer.app.extensions.install', { source: 'npm:@acme/notes@1.2.3' });
    expect(installed).toEqual({ file: expect.stringMatching(/presets[\\/].+\.json$/), restartRequired: true });
    expect(await kernel.exec('kvcustomizer.app.preset.get', {})).toMatchObject({ origin: 'home', file: installed.file, extensions: { '@acme/notes': 'npm:1.2.3' } });
    expect(await kernel.exec('kvcustomizer.app.extensions.uninstall', { name: '@acme/notes' })).toEqual({ file: installed.file, restartRequired: true });
    expect((await kernel.exec('kvcustomizer.app.preset.get', {})).extensions).not.toHaveProperty('@acme/notes');
  });

  it('QA17-E16 model-set refuses a model that cannot be called now, and sets nothing', async () => {
    const { kernel } = await withRelay();
    await kernel.exec('kvcustomizer.app.model.set', { model: 'relay/m1' });
    for (const model of ['anthropic/claude-sonnet-5-5', 'relay/missing', 'nonsense']) {
      await expect(kernel.exec('kvcustomizer.app.model.set', { model }), model).rejects.toEqual(failed('VALIDATION_FAILED'));
    }
    expect((await kernel.exec('kernel.settings.list', {})).find((setting) => setting.key === 'kvai.defaultModel')?.value).toBe('relay/m1');
  });

  it('QA17-E15 no app command reads, writes, lists, or returns a secret, and an unknown setting is NOT_FOUND', async () => {
    const { kernel } = await withRelay();
    await kernel.exec('kernel.secrets.set', { extension: '@kvman/kvai', name: 'probe', value: 'S3CRET-VALUE' });
    const before = await kernel.exec('kernel.secrets.list', {});
    const answers = [
      await kernel.exec('kvcustomizer.app.model.list', {}),
      await kernel.exec('kvcustomizer.app.settings.list', {}),
      await kernel.exec('kvcustomizer.app.extensions.list', {}),
      await kernel.exec('kvcustomizer.app.preset.get', {}),
      await kernel.exec('kvcustomizer.app.model.set', { model: 'relay/m1' }),
      await kernel.exec('kvcustomizer.app.extensions.install', { source: 'npm:@acme/notes@1.2.3' }),
      await kernel.exec('kvcustomizer.app.extensions.uninstall', { name: '@acme/notes' }),
    ];
    expect(JSON.stringify(answers)).not.toContain('S3CRET-VALUE');
    expect(await kernel.exec('kernel.secrets.list', {})).toEqual(before);
    await expect(kernel.exec('kvcustomizer.app.settings.set', { key: 'nobody.nothing', value: 1, scope: 'global' })).rejects.toEqual(failed('NOT_FOUND'));
    for (const file of readdirSync(appFolder)) {
      const code = readFileSync(path.join(appFolder, file), 'utf8').split('\n').filter((line) => !line.trimStart().startsWith('//')).join('\n');
      expect(code.toLowerCase(), file).not.toContain('secret');
    }
  });
});
