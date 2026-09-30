import { describe, expect, it } from 'vitest';
import { useKvai } from './support/kvai-kernel.ts';

const kvai = useKvai();

const builtIn = { problem: { code: 'kvai/BUILT_IN' } };

describe('providers and models (07 §7.2)', () => {
  it("M2.1-H3 anthropic/claude-sonnet-5-5 is in pi-ai's built-in list", async () => {
    const { kernel } = await kvai.start();
    const models = await kernel.exec('kvai.model.list', { provider: 'anthropic' });
    expect(models).toContainEqual(expect.objectContaining({ id: 'anthropic/claude-sonnet-5-5', name: 'Claude Sonnet 5.5', provider: 'anthropic', reasoning: true, builtIn: true }));
  });

  it('M2.1-H5 removing a built-in provider or model fails kvai/BUILT_IN, and both stay', async () => {
    const { kernel } = await kvai.start();
    await expect(kernel.exec('kvai.provider.remove', { id: 'anthropic' })).rejects.toMatchObject({ problem: { code: 'kvai/BUILT_IN', params: { id: 'anthropic' } } });
    await expect(kernel.exec('kvai.model.remove', { id: 'anthropic/claude-sonnet-5-5' })).rejects.toMatchObject({
      problem: { code: 'kvai/BUILT_IN', params: { id: 'anthropic/claude-sonnet-5-5' } },
    });
    expect(await kernel.exec('kvai.provider.list', {})).toContainEqual(expect.objectContaining({ id: 'anthropic', builtIn: true }));
    expect((await kernel.exec('kvai.model.list', { provider: 'anthropic' })).map((model) => model.id)).toContain('anthropic/claude-sonnet-5-5');
  });

  it('M2.1-E13 the provider list has every built-in with its key state, and the custom ones', async () => {
    const { kernel } = await kvai.start({ secrets: { '@kvman/kvai': { 'anthropic.apiKey': 'sk-ant' } } });
    const providers = await kernel.exec('kvai.provider.list', {});
    const builtIns = providers.filter((provider) => provider.builtIn).map((provider) => provider.id);
    expect(builtIns).toEqual(expect.arrayContaining(['anthropic', 'openai', 'google', 'openrouter', 'amazon-bedrock', 'google-vertex', 'openai-codex']));
    expect(builtIns).toHaveLength(42);
    expect(providers).toContainEqual(expect.objectContaining({ id: 'anthropic', title: 'Anthropic', builtIn: true, status: 'ready' }));
    expect(providers).toContainEqual(expect.objectContaining({ id: 'openai', title: 'OpenAI', builtIn: true, status: 'needsKey' }));
    expect(providers).toContainEqual({ id: 'fake', title: 'Fake', builtIn: false, status: 'noKey', models: 2 });
    expect(JSON.stringify(providers)).not.toContain('sk-ant');
  });

  it('M2.1-E14 adding a built-in id fails kvai/BUILT_IN, and an API outside the five fails VALIDATION_FAILED', async () => {
    const { kernel, fake } = await kvai.start();
    await expect(kernel.exec('kvai.provider.add', { id: 'openai', title: 'Mine', api: 'openai-completions', baseUrl: fake.baseUrl })).rejects.toMatchObject(builtIn);
    await expect(kernel.exec('kvai.provider.add', { id: 'aws', title: 'AWS', api: 'bedrock-converse-stream', baseUrl: fake.baseUrl } as never)).rejects.toMatchObject({
      problem: { code: 'VALIDATION_FAILED' },
    });
    await expect(kernel.exec('kvai.provider.add', { id: 'both', title: 'Both', api: 'openai-completions', baseUrl: fake.baseUrl, delegate: 'x.y' } as never)).rejects.toMatchObject({
      problem: { code: 'VALIDATION_FAILED' },
    });
    await expect(kernel.exec('kvai.provider.add', { id: 'a/b', title: 'Slash', delegate: 'x.complete' })).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
  });

  it('M2.1-E20 the model list has every field, and filters by provider', async () => {
    const { kernel } = await kvai.start();
    const all = await kernel.exec('kvai.model.list', {});
    expect(all).toContainEqual({
      id: 'fake/m1',
      name: 'M1',
      provider: 'fake',
      reasoning: true,
      input: ['text'],
      contextWindow: 128_000,
      maxTokens: 8192,
      cost: { input: 1, output: 2, cacheRead: 0.5, cacheWrite: 1.5 },
      builtIn: false,
      isDefault: false,
    });
    expect(new Set(all.map((model) => model.provider)).size).toBeGreaterThan(30);
    const fakeOnly = await kernel.exec('kvai.model.list', { provider: 'fake' });
    expect(fakeOnly.map((model) => model.id)).toEqual(['fake/m1', 'fake/m2']);
    const sonnet = all.find((model) => model.id === 'anthropic/claude-sonnet-5-5');
    expect(Object.keys(sonnet ?? {}).sort()).toEqual(['builtIn', 'contextWindow', 'cost', 'id', 'input', 'isDefault', 'maxTokens', 'name', 'provider', 'reasoning']);
    expect(all.every((model) => Object.values(model.cost).every((rate) => rate >= 0))).toBe(true);
    const router = 'openrouter/openrouter/auto';
    expect(all.map((model) => model.id)).not.toContain(router);
    expect(all.map((model) => model.id)).toContain('openrouter/anthropic/claude-sonnet-5.5');
    await expect(kernel.exec('kvai.complete', { model: router, messages: [] })).rejects.toMatchObject({ problem: { code: 'kvai/MODEL_UNKNOWN', params: { model: router } } });
  });
});
