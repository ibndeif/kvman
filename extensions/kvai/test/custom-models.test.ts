import { describe, expect, it } from 'vitest';
import { useKvai, userSays } from './support/kvai-kernel.ts';

const kvai = useKvai();

const model = { reasoning: false, input: ['text' as const], contextWindow: 32_000, maxTokens: 4096 };

describe('custom providers and models (07 §7.2, ADR 0009, 54–57)', () => {
  it('M2.1-E15 adding a custom provider id again replaces it and keeps its models', async () => {
    const { kernel, fake } = await kvai.start();
    await kernel.exec('kvai.provider.add', { id: 'fake', title: 'Renamed', api: 'openai-completions', baseUrl: fake.baseUrl, headers: { 'x-team': 'blue' } });
    const providers = await kernel.exec('kvai.provider.list', {});
    expect(providers.filter((provider) => provider.id === 'fake')).toEqual([{ id: 'fake', title: 'Renamed', builtIn: false, key: 'missing' }]);
    expect((await kernel.exec('kvai.model.list', { provider: 'fake' })).map((row) => row.id)).toEqual(['fake/m1', 'fake/m2']);
    fake.reply({ chunks: [{ text: 'ok' }] });
    await kernel.exec('kvai.complete', { model: 'fake/m1', messages: [userSays('hi')] });
    expect(fake.requests()).toHaveLength(1);
  });

  it('M2.1-E16 a model for an unknown provider fails kvai/PROVIDER_UNKNOWN, and one for a built-in provider kvai/BUILT_IN', async () => {
    const { kernel } = await kvai.start();
    await expect(kernel.exec('kvai.model.add', { provider: 'ghost', id: 'g1', name: 'G1', ...model })).rejects.toMatchObject({
      problem: { code: 'kvai/PROVIDER_UNKNOWN', params: { provider: 'ghost' } },
    });
    await expect(kernel.exec('kvai.model.add', { provider: 'anthropic', id: 'claude-next', name: 'Next', ...model })).rejects.toMatchObject({
      problem: { code: 'kvai/BUILT_IN', params: { id: 'anthropic' } },
    });
  });

  it('M2.1-E17 adding a custom model id again replaces it, and a model without cost costs nothing', async () => {
    const { kernel, fake } = await kvai.start();
    await kernel.exec('kvai.model.add', { provider: 'fake', id: 'm1', name: 'M1 again', ...model });
    const rows = await kernel.exec('kvai.model.list', { provider: 'fake' });
    expect(rows.filter((row) => row.id === 'fake/m1')).toEqual([
      { id: 'fake/m1', name: 'M1 again', provider: 'fake', ...model, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, builtIn: false },
    ]);
    fake.reply({ chunks: [{ text: 'free' }], usage: { input: 100, output: 50 } });
    const answer = await kernel.exec('kvai.complete', { model: 'fake/m1', messages: [userSays('hi')] });
    expect(answer.usage).toEqual({ input: 100, output: 50, cacheRead: 0, cacheWrite: 0, cost: 0 });
  });

  it('M2.1-E18 a model id with a slash splits at the first one', async () => {
    const { kernel, fake } = await kvai.start();
    await kernel.exec('kvai.model.add', { provider: 'fake', id: 'org/m', name: 'Org M', ...model });
    expect((await kernel.exec('kvai.model.list', { provider: 'fake' })).map((row) => row.id)).toContain('fake/org/m');
    fake.reply({ chunks: [{ text: 'ok' }] });
    await kernel.exec('kvai.complete', { model: 'fake/org/m', messages: [userSays('hi')] });
    expect(fake.requests()[0]?.body).toMatchObject({ model: 'org/m' });
  });

  it('M2.1-E19 removing a custom provider removes its models, and removing a missing id does nothing', async () => {
    const { kernel } = await kvai.start();
    await kernel.exec('kvai.model.remove', { id: 'fake/m2' });
    expect((await kernel.exec('kvai.model.list', { provider: 'fake' })).map((row) => row.id)).toEqual(['fake/m1']);
    await kernel.exec('kvai.provider.remove', { id: 'fake' });
    expect((await kernel.exec('kvai.provider.list', {})).map((provider) => provider.id)).not.toContain('fake');
    expect(await kernel.exec('kvai.model.list', { provider: 'fake' })).toEqual([]);
    await expect(kernel.exec('kvai.provider.remove', { id: 'fake' })).resolves.toEqual({});
    await expect(kernel.exec('kvai.model.remove', { id: 'fake/m1' })).resolves.toEqual({});
    await expect(kernel.exec('kvai.model.remove', { id: 'no-slash' })).resolves.toEqual({});
    await expect(kernel.exec('kvai.complete', { model: 'fake/m1', messages: [userSays('hi')] })).rejects.toMatchObject({ problem: { code: 'kvai/MODEL_UNKNOWN' } });
  });
});
