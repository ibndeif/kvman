import { describe, expect, it } from 'vitest';
import { useKvai } from './support/kvai-kernel.ts';

const kvai = useKvai();

const problem = (code: string, params?: Record<string, unknown>) => ({ problem: params === undefined ? { code } : { code, params } });
const oauth = '{"type":"oauth","access":"a","refresh":"r","expires":1}';

describe('kvai.provider.disconnect (07 §7.2, ADR 0009, 226)', () => {
  it('QA15-H1 disconnect clears a key', async () => {
    const { kernel } = await kvai.start({ secrets: { '@kvman/kvai': { 'anthropic.apiKey': 'sk-ant' } } });
    await kernel.exec('kvai.provider.key.set', { provider: 'fake', key: 'sk-fake' });
    await expect(kernel.exec('kvai.provider.disconnect', { provider: 'anthropic' })).resolves.toEqual({});
    expect(await kernel.exec('kernel.secrets.list', {})).not.toContainEqual({ extension: '@kvman/kvai', name: 'anthropic.apiKey' });
    const anthropicModels = (await kernel.exec('kvai.model.list', { provider: 'anthropic' })).length;
    expect(await kernel.exec('kvai.provider.get', { id: 'anthropic' })).toEqual({
      id: 'anthropic',
      title: 'Anthropic',
      builtIn: true,
      status: 'needsKey',
      models: anthropicModels,
      connection: null,
      signIn: true,
      apiKey: true,
    });
    await expect(kernel.exec('kvai.provider.disconnect', { provider: 'fake' })).resolves.toEqual({});
    expect(await kernel.exec('kernel.secrets.list', {})).not.toContainEqual({ extension: '@kvman/kvai', name: 'fake.apiKey' });
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
  });

  it('QA15-H2 disconnect clears a sign-in', async () => {
    const { kernel } = await kvai.start({ secrets: { '@kvman/kvai': { 'openai-codex.oauth': oauth } } });
    expect(await kernel.exec('kvai.provider.get', { id: 'openai-codex' })).toMatchObject({ status: 'ready', connection: 'oauth' });
    await expect(kernel.exec('kvai.provider.disconnect', { provider: 'openai-codex' })).resolves.toEqual({});
    expect(await kernel.exec('kernel.secrets.list', {})).not.toContainEqual({ extension: '@kvman/kvai', name: 'openai-codex.oauth' });
    const codexModels = (await kernel.exec('kvai.model.list', { provider: 'openai-codex' })).length;
    expect(await kernel.exec('kvai.provider.get', { id: 'openai-codex' })).toEqual({
      id: 'openai-codex',
      title: 'OpenAI Codex (legacy)',
      builtIn: true,
      status: 'needsKey',
      models: codexModels,
      connection: null,
      signIn: true,
      apiKey: false,
    });
  });

  it('QA15-E2 disconnect is repeatable and narrow', async () => {
    const { kernel } = await kvai.start({
      secrets: { '@kvman/kvai': { 'anthropic.oauth': oauth } },
      settings: { 'kvai.defaultModel': 'anthropic/claude-sonnet-5-5' },
    });
    await expect(kernel.exec('kvai.provider.disconnect', { provider: 'openai' })).resolves.toEqual({});
    expect(await kernel.exec('kvai.provider.get', { id: 'openai' })).toMatchObject({ status: 'needsKey', connection: null });
    await kernel.exec('kvai.provider.key.delete', { provider: 'anthropic' });
    expect(await kernel.exec('kernel.secrets.list', {})).toContainEqual({ extension: '@kvman/kvai', name: 'anthropic.oauth' });
    expect(await kernel.exec('kvai.provider.get', { id: 'anthropic' })).toMatchObject({ status: 'ready', connection: 'oauth' });
    await expect(kernel.exec('kvai.provider.disconnect', { provider: 'anthropic' })).resolves.toEqual({});
    await expect(kernel.exec('kvai.provider.disconnect', { provider: 'anthropic' })).resolves.toEqual({});
    expect(await kernel.exec('kernel.secrets.list', {})).not.toContainEqual({ extension: '@kvman/kvai', name: 'anthropic.oauth' });
    expect(await kernel.exec('kvai.provider.get', { id: 'anthropic' })).toMatchObject({ status: 'needsKey', connection: null });
    expect(await kernel.exec('kvai.model.default.get', {})).toEqual({ id: 'anthropic/claude-sonnet-5-5', name: 'Claude Sonnet 5.5', ready: false });
  });

  it('QA15-E1 disconnect names an unknown provider', async () => {
    const { kernel } = await kvai.start();
    await expect(kernel.exec('kvai.provider.disconnect', { provider: 'nowhere' })).rejects.toMatchObject(problem('kvai/PROVIDER_UNKNOWN', { provider: 'nowhere' }));
  });
});
