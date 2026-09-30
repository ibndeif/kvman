import { describe, expect, it, vi } from 'vitest';
import type { ProgressChunk } from '@kvman/testkit';
import { kvaiDeltas, m1Cost, useKvai, userSays } from './support/kvai-kernel.ts';

const kvai = useKvai();

const bash = { name: 'bash', description: 'Runs a command.', parameters: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] } };

describe('kvai.complete (07 §7.1)', () => {
  it('M2.1-H1 streams text, thinking, and tool-call deltas to the root job, and returns the message and usage', async () => {
    const { kernel, fake } = await kvai.start();
    fake.reply({
      chunks: [{ thinking: 'hmm' }, { text: 'Hel' }, { text: 'lo' }, { toolCall: { id: 'call_1', name: 'bash', arguments: { command: 'ls' } } }],
      usage: { input: 15, output: 7, cacheRead: 10, cacheWrite: 5 },
    });
    const chunks: ProgressChunk[] = [];
    const output = await kernel.exec('harness.turn', { model: 'fake/m1', systemPrompt: 'Be brief.', messages: [userSays('hi')], tools: [bash] }, { onProgress: (chunk) => chunks.push(chunk) });
    expect(kvaiDeltas(chunks)).toEqual([
      { type: 'thinking', delta: 'hmm' },
      { type: 'text', delta: 'Hel' },
      { type: 'text', delta: 'lo' },
      { type: 'toolcall', name: 'bash' },
    ]);
    const cost = (15 * m1Cost.input + 7 * m1Cost.output + 10 * m1Cost.cacheRead + 5 * m1Cost.cacheWrite) / 1_000_000;
    expect(output).toMatchObject({ stopReason: 'toolUse', usage: { input: 15, output: 7, cacheRead: 10, cacheWrite: 5 } });
    expect(output).toHaveProperty('usage.cost', expect.closeTo(cost, 12));
    expect(output).toHaveProperty('message', {
      role: 'assistant',
      content: [
        { type: 'thinking', thinking: 'hmm', thinkingSignature: 'reasoning_content' },
        { type: 'text', text: 'Hello' },
        { type: 'toolCall', id: 'call_1', name: 'bash', arguments: { command: 'ls' } },
      ],
      api: 'openai-completions',
      provider: 'fake',
      model: 'm1',
      responseId: 'chatcmpl-fake',
      usage: expect.objectContaining({ input: 15, output: 7, cacheRead: 10, cacheWrite: 5, totalTokens: 37 }),
      stopReason: 'toolUse',
      timestamp: expect.any(Number),
    });
    const [request] = fake.requests();
    expect(request?.body).toMatchObject({
      model: 'm1',
      stream: true,
      // pi-ai sends a reasoning model's system prompt with the OpenAI `developer` role.
      messages: [{ role: 'developer', content: 'Be brief.' }, { role: 'user', content: 'hi' }],
      tools: [{ type: 'function', function: { name: 'bash', description: 'Runs a command.', parameters: bash.parameters } }],
    });
  });

  it('M2.1-E3 a cancel aborts the provider call, and the job ends cancelled', async () => {
    const { kernel, fake } = await kvai.start();
    let release = (): void => undefined;
    fake.reply({ chunks: [{ text: 'Once' }, { wait: new Promise<void>((resolve) => (release = resolve)) }, { text: ' more' }] });
    const chunks: ProgressChunk[] = [];
    const jobId = await kernel.execAsync('harness.turn', { model: 'fake/m1', messages: [userSays('tell a story')] }, { onProgress: (chunk) => chunks.push(chunk) });
    await vi.waitFor(() => expect(kvaiDeltas(chunks)).toEqual([{ type: 'text', delta: 'Once' }]));
    kernel.cancel(jobId);
    await expect(kernel.waitForJob(jobId)).resolves.toMatchObject({ status: 'cancelled' });
    await vi.waitFor(() => expect(fake.requests()[0]?.state).toBe('aborted'));
    release();
  });

  it('M2.1-E4 a finish of length returns with stopReason length', async () => {
    const { kernel, fake } = await kvai.start();
    fake.reply({ chunks: [{ text: 'cut' }], finish: 'length' });
    await expect(kernel.exec('kvai.complete', { model: 'fake/m1', messages: [userSays('go on')] })).resolves.toMatchObject({ stopReason: 'length', message: { content: [{ type: 'text', text: 'cut' }] } });
  });
});
