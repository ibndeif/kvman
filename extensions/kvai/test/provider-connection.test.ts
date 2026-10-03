import { describe, expect, it } from 'vitest';
import { useKvai } from './support/kvai-kernel.ts';

const kvai = useKvai();

const problem = (code: string, params?: Record<string, unknown>) => ({ problem: params === undefined ? { code } : { code, params } });
const oauth = '{"type":"oauth","access":"a","refresh":"r","expires":1}';
const key = 'sk-ant-m22-secret';

describe('provider connection rows (07 §7.2, ADR 0009, 228–229)', () => {
  it('QA15-H3 rows say how a provider is connected', async () => {
    const { kernel } = await kvai.start({ secrets: { '@kvman/kvai': { 'anthropic.apiKey': key, 'openai-codex.oauth': oauth } } });
    const rows = await kernel.exec('kvai.provider.list', {});
    const anthropicModels = (await kernel.exec('kvai.model.list', { provider: 'anthropic' })).length;
    const codexModels = (await kernel.exec('kvai.model.list', { provider: 'openai-codex' })).length;
    expect(rows).toContainEqual({
      id: 'anthropic',
      title: 'Anthropic',
      builtIn: true,
      status: 'ready',
      models: anthropicModels,
      connection: 'apiKey',
      signIn: true,
      apiKey: true,
    });
    expect(rows).toContainEqual({
      id: 'openai-codex',
      title: 'OpenAI Codex (legacy)',
      builtIn: true,
      status: 'ready',
      models: codexModels,
      connection: 'oauth',
      signIn: true,
      apiKey: false,
    });
    expect(await kernel.exec('kvai.provider.get', { id: 'openai' })).toMatchObject({ status: 'needsKey', connection: null, signIn: true, apiKey: true });
    expect(await kernel.exec('kvai.provider.get', { id: 'fake' })).toEqual({
      id: 'fake',
      title: 'Fake',
      builtIn: false,
      status: 'noKey',
      models: 2,
      connection: null,
      signIn: false,
      apiKey: true,
    });
    const signedIn = rows
      .filter((row) => row.signIn)
      .map((row) => row.id)
      .sort();
    expect(signedIn).toEqual(['anthropic', 'github-copilot', 'kimi-coding', 'meta', 'openai', 'openai-codex', 'openrouter', 'radius', 'xai']);
    expect(rows.filter((row) => row.apiKey === false).map((row) => row.id)).toEqual(['openai-codex']);
    const codexModel = (await kernel.exec('kvai.model.list', { provider: 'openai-codex' }))[0];
    if (codexModel === undefined) throw new Error('openai-codex has no models');
    await kernel.exec('kernel.settings.set', { key: 'kvai.defaultModel', value: codexModel.id, scope: 'global' });
    expect(await kernel.exec('kvai.model.default.get', {})).toEqual({ id: codexModel.id, name: codexModel.name, ready: true });
  });

  it('QA15-H4 saving a key replaces a sign-in', async () => {
    const { kernel } = await kvai.start({ secrets: { '@kvman/kvai': { 'anthropic.oauth': oauth } } });
    expect(await kernel.exec('kvai.provider.get', { id: 'anthropic' })).toMatchObject({ status: 'ready', connection: 'oauth' });
    await kernel.exec('kvai.provider.key.set', { provider: 'anthropic', key });
    const secrets = await kernel.exec('kernel.secrets.list', {});
    expect(secrets).toContainEqual({ extension: '@kvman/kvai', name: 'anthropic.apiKey' });
    expect(secrets).not.toContainEqual({ extension: '@kvman/kvai', name: 'anthropic.oauth' });
    expect(await kernel.exec('kvai.provider.get', { id: 'anthropic' })).toMatchObject({ status: 'ready', connection: 'apiKey' });
  });

  it('QA15-E3 a sign-in-only provider takes no key', async () => {
    const { kernel } = await kvai.start();
    await expect(kernel.exec('kvai.provider.key.set', { provider: 'openai-codex', key })).rejects.toMatchObject(problem('kvai/KEY_UNSUPPORTED', { provider: 'openai-codex' }));
    expect((await kernel.exec('kernel.secrets.list', {})).filter((secret) => secret.name.startsWith('openai-codex.'))).toEqual([]);
    expect(await kernel.exec('kvai.provider.get', { id: 'openai-codex' })).toMatchObject({ status: 'needsKey', connection: null });
  });
});
