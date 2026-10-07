import { describe, expect, it } from 'vitest';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { newSession } from './support/turns.ts';

const kvcoder = useKvcoder();

describe("the size of a chat's context (08 §8.6, ADR 0034, 9)", { timeout: 30_000 }, () => {
  it("QA46-H9 the count is the last call's reported prompt and output, against the model's window", async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply({ chunks: [{ text: 'hi' }], usage: { input: 60_000, cacheRead: 45_000, output: 10 } });
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'hello' });
    await kernel.clock.advance(0);
    expect(await kernel.exec('kvcoder.context.get', { sessionId })).toEqual({ tokens: 105_010, window: 128_000, compactAt: 0.8 });
  });

  it("QA46-E6 a model that isn't known has no window", async () => {
    const { kernel } = await kvcoder.start({ settings: { 'kvcoder.model': 'gone/x1' } });
    const sessionId = await newSession(kernel);
    expect(await kernel.exec('kvcoder.context.get', { sessionId })).toMatchObject({ window: null, compactAt: 0.8 });
  });
});
