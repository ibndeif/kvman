import { describe, expect, it } from 'vitest';
import type { Message } from '../src/index.ts';
import { useKvai, userSays } from './support/kvai-kernel.ts';

const kvai = useKvai();

const hi = [userSays('hi')];
const ok = { chunks: [{ text: 'ok' }] };

describe("kvai.complete's options (07 §7.1, ADR 0009, 58–59)", () => {
  it('M2.1-E1 thinking sets the reasoning effort, and is off by default', async () => {
    const { kernel, fake } = await kvai.start();
    fake.reply(ok, ok);
    await kernel.exec('kvai.complete', { model: 'fake/m1', messages: hi, thinking: 'high' });
    await kernel.exec('kvai.complete', { model: 'fake/m1', messages: hi });
    const [high, off] = fake.requests();
    expect(high?.body).toMatchObject({ reasoning_effort: 'high' });
    expect(off?.body).not.toHaveProperty('reasoning_effort');
  });

  it("M2.1-E2 maxTokens caps the answer, and defaults to the model's maximum", async () => {
    const { kernel, fake } = await kvai.start();
    fake.reply(ok, ok);
    await kernel.exec('kvai.complete', { model: 'fake/m1', messages: hi, maxTokens: 500 });
    await kernel.exec('kvai.complete', { model: 'fake/m1', messages: hi });
    const [capped, whole] = fake.requests();
    expect(capped?.body).toMatchObject({ max_completion_tokens: 500 });
    expect(whole?.body).toMatchObject({ max_completion_tokens: 8192 });
  });

  it('M2.1-E5 a returned message goes back as input, with a tool result', async () => {
    const { kernel, fake } = await kvai.start();
    fake.reply({ chunks: [{ text: 'Listing.' }, { toolCall: { id: 'call_1', name: 'bash', arguments: { command: 'ls' } } }] }, ok);
    const first = await kernel.exec('kvai.complete', { model: 'fake/m1', messages: hi });
    const result: Message = { role: 'toolResult', toolCallId: 'call_1', toolName: 'bash', content: [{ type: 'text', text: 'a.txt' }], isError: false, timestamp: 2 };
    await kernel.exec('kvai.complete', { model: 'fake/m1', messages: [...hi, first.message, result] });
    expect(fake.requests()[1]?.body).toMatchObject({
      messages: [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'Listing.', tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'bash', arguments: '{"command":"ls"}' } }] },
        { role: 'tool', tool_call_id: 'call_1', content: 'a.txt' },
      ],
    });
  });

  it('M2.1-E6 an unknown role, an unknown block, and a tool without parameters fail VALIDATION_FAILED', async () => {
    const { kernel, fake } = await kvai.start();
    const invalid = { problem: { code: 'VALIDATION_FAILED' } };
    const system = { role: 'system', content: 'Be brief.', timestamp: 1 };
    await expect(kernel.exec('kvai.complete', { model: 'fake/m1', messages: [system] } as never)).rejects.toMatchObject(invalid);
    const video = { role: 'user', content: [{ type: 'video', url: 'x' }], timestamp: 1 };
    await expect(kernel.exec('kvai.complete', { model: 'fake/m1', messages: [video] } as never)).rejects.toMatchObject(invalid);
    const tool = { name: 'bash', description: 'Runs a command.' };
    await expect(kernel.exec('kvai.complete', { model: 'fake/m1', messages: hi, tools: [tool] } as never)).rejects.toMatchObject(invalid);
    expect(fake.requests()).toHaveLength(0);
  });

  it('M2.1-E7 a call without a model uses kvai.defaultModel, which takes only a full model id', async () => {
    const { kernel, fake } = await kvai.start({ settings: { 'kvai.defaultModel': 'fake/m2' } });
    fake.reply(ok);
    await kernel.exec('kvai.complete', { messages: hi });
    expect(fake.requests()[0]?.body).toMatchObject({ model: 'm2' });
    await expect(kernel.exec('kernel.settings.set', { key: 'kvai.defaultModel', value: 'no-provider', scope: 'global' })).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
  });
});
