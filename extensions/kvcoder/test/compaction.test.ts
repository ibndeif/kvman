import { describe, expect, it, vi } from 'vitest';
import type { TestKernel } from '@kvman/testkit';
import type { FakeOpenAI } from '@kvman/testkit/fake-openai';
import { heldReply } from './support/held-reply.ts';
import { wait } from './support/wait.ts';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { requestMessages, says, textOf } from './support/model-script.ts';
import { kvcoderChunks, newSession, sendStreamed } from './support/turns.ts';

const kvcoder = useKvcoder();

// Seven turns of a message and an answer: 14 messages.
async function history(kernel: TestKernel, fake: FakeOpenAI, sessionId: string): Promise<void> {
  for (const index of [1, 2, 3, 4, 5, 6, 7]) {
    fake.reply(says(`answer ${index}`));
    await kernel.exec('kvcoder.message.send', { sessionId, text: `message ${index}` });
    await kernel.clock.advance(0);
  }
  await kernel.exec('kernel.settings.set', { key: 'kvcoder.compactAt', value: 0.0001, scope: 'global' });
}

const sent = (fake: FakeOpenAI) => requestMessages(fake).filter((message) => message.role !== 'system' && message.role !== 'developer').map(textOf);

describe('compaction (08 §8.1)', { timeout: 30_000 }, () => {
  it('M2.4-H9 above compactAt the older messages are summarized and the last 10 kept whole', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    await history(kernel, fake, sessionId);
    fake.reply(says('SUMMARY'), says('answer 8'));
    const stream = await sendStreamed(kernel, sessionId, 'message 8');
    await kernel.clock.advance(0);
    const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 });
    expect(messages.find((message) => message.kind === 'summary')?.content).toEqual({ text: 'SUMMARY', coversThroughSeq: 4 });
    expect(messages.filter((message) => message.kind === 'user')).toHaveLength(8);
    expect(sent(fake)).toEqual(['A summary of the earlier conversation:\nSUMMARY', 'answer 3', 'message 4', 'answer 4', 'message 5', 'answer 5', 'message 6', 'answer 6', 'message 7', 'answer 7', 'message 8']);
    const marks = kvcoderChunks(stream).filter((chunk) => typeof chunk === 'object' && chunk !== null && 'type' in chunk && chunk.type === 'compaction');
    expect(marks).toEqual([{ type: 'compaction', state: 'started' }, { type: 'compaction', state: 'done' }]);
    const started = stream.chunks.findIndex((chunk) => chunk.source === '@kvman/kvcoder' && JSON.stringify(chunk.data).includes('started'));
    expect(stream.chunks.slice(started + 1).find((chunk) => chunk.source === '@kvman/kvai')?.data).toEqual({ type: 'text', delta: 'SUMMARY' });
  });

  it('M2.4-E48 a failed summary adds a notice and the step goes on; CONTEXT_TOO_LONG ends the turn; compact runs by hand', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    await history(kernel, fake, sessionId);
    const tooLong = "This model's maximum context length is 128000 tokens. However, your messages resulted in 200000 tokens.";
    fake.reply({ status: 500, body: { error: { message: 'down', type: 'server_error' } } }, { status: 400, body: { error: { message: tooLong, type: 'invalid_request_error' } } });
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'message 8' });
    await kernel.clock.advance(0);
    const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 });
    expect(messages.filter((message) => message.kind === 'notice').map((message) => message.content)).toEqual([
      { code: 'SUMMARY_FAILED', params: { code: 'kvai/PROVIDER_ERROR' } },
      { code: 'STEP_FAILED', params: { code: 'kvai/CONTEXT_TOO_LONG' } },
    ]);
    await kernel.exec('kernel.settings.set', { key: 'kvcoder.compactAt', value: 0.8, scope: 'global' });
    fake.reply(says('BY HAND'));
    await kernel.exec('kvcoder.session.compact', { sessionId });
    const after = await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 });
    expect(after.messages.at(-1)).toMatchObject({ kind: 'summary', content: { text: 'BY HAND' } });
  });

  it('M2.4-E3 compacting while a step runs fails SESSION_BUSY', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    const held = heldReply({ text: 'slow' });
    fake.reply(held.reply);
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await vi.waitFor(() => expect(fake.requests()).toHaveLength(1), wait);
    await expect(kernel.exec('kvcoder.session.compact', { sessionId })).rejects.toMatchObject({ problem: { code: 'kvcoder/SESSION_BUSY' } });
    held.release();
    await kernel.clock.advance(0);
  });
});
