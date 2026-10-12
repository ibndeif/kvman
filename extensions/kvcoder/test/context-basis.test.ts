import { describe, expect, it } from 'vitest';
import type { FakeReply } from '@kvman/testkit/fake-openai';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { newSession } from './support/turns.ts';

const kvcoder = useKvcoder();
const counted = (text: string, input: number): FakeReply => ({ chunks: [{ text }], usage: { input, output: 10 } });

describe('the context size is tied to what it was measured with (KVC-15, ADR 0058)', { timeout: 30_000 }, () => {
  it("M2.4-E184 the provider's count is used while the model and prompt are the same, and an estimate after they change", async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    expect(await kernel.exec('kvcoder.context.get', { sessionId })).toMatchObject({ estimated: true });
    fake.reply(counted('hello', 4321));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    expect(await kernel.exec('kvcoder.context.get', { sessionId })).toMatchObject({ tokens: 4331, estimated: false });
    await kernel.exec('kvcoder.session.configure', { sessionId, model: 'fake/m2' });
    const changed = await kernel.exec('kvcoder.context.get', { sessionId });
    expect(changed.estimated).toBe(true);
    expect(changed.tokens).not.toBe(4331);
    await kernel.exec('kvcoder.session.configure', { sessionId, model: 'fake/m1' });
    expect(await kernel.exec('kvcoder.context.get', { sessionId })).toMatchObject({ tokens: 4331, estimated: false });
    await kernel.exec('kernel.settings.set', { key: 'kvcoder.connectors.disabled', value: ['artifact'], scope: 'workspace' });
    expect(await kernel.exec('kvcoder.context.get', { sessionId })).toMatchObject({ estimated: true });
  });
});
