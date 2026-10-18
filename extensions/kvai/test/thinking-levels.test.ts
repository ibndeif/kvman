import { describe, expect, it } from 'vitest';
import { useKvai } from './support/kvai-kernel.ts';

// ADR 0087, 11: `kvai.model.list` gives each model its own thinking levels.

const kvai = useKvai();

const levelsOf = async (kernel: Awaited<ReturnType<typeof kvai.start>>['kernel'], provider: string, id: string) => (await kernel.exec('kvai.model.list', { provider })).find((row) => row.id === id)?.thinkingLevels;

describe("each model's thinking levels (ADR 0087, 11)", () => {
  it('QA55-H11 built-in models have their own levels, and custom ones up to high when they reason', async () => {
    const { kernel } = await kvai.start();
    expect(await levelsOf(kernel, 'openai-codex', 'openai-codex/gpt-6-luna')).toEqual(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']);
    expect(await levelsOf(kernel, 'openai', 'openai/gpt-6-luna')).toEqual(['off', 'low', 'medium', 'high', 'xhigh', 'max']);
    const custom = { input: ['text' as const], contextWindow: 32_000, maxTokens: 4096 };
    await kernel.exec('kvai.model.add', { provider: 'fake', id: 'thinker', name: 'Thinker', reasoning: true, ...custom });
    await kernel.exec('kvai.model.add', { provider: 'fake', id: 'plain', name: 'Plain', reasoning: false, ...custom });
    expect(await levelsOf(kernel, 'fake', 'fake/thinker')).toEqual(['off', 'minimal', 'low', 'medium', 'high']);
    expect(await levelsOf(kernel, 'fake', 'fake/plain')).toEqual(['off']);
  });

  it('QA55-H12 kvai.complete takes xhigh and max', async () => {
    const { kernel, fake } = await kvai.start();
    for (const thinking of ['xhigh', 'max'] as const) {
      fake.reply({ chunks: [{ text: 'ok' }] });
      expect((await kernel.exec('kvai.complete', { model: 'fake/m1', messages: [{ role: 'user', content: 'hi', timestamp: 1 }], thinking })).stopReason).toBe('stop');
    }
  });
});
