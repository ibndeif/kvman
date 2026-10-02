import { describe, expect, it, vi } from 'vitest';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { says } from './support/model-script.ts';
import { kvcoderChunks, newSession, sendStreamed, turnState } from './support/turns.ts';
import { wait } from './support/wait.ts';

const kvcoder = useKvcoder();

const failure = (status: number, message: string) => ({ status, body: { error: { message, type: 'server_error' } } });
const retries = (stream: Awaited<ReturnType<typeof sendStreamed>>): unknown[] => kvcoderChunks(stream).filter((chunk) => typeof chunk === 'object' && chunk !== null && 'type' in chunk && chunk.type === 'retry');

describe("a step's model call retried (08 §8.2, ADR 0009, 154 and 155)", { timeout: 60_000 }, () => {
  it('QA3-H22 a transient failure twice, then an answer: the turn is done after 3 requests, with the retries announced and nothing stored for the failures', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply(failure(503, 'Service Unavailable'), failure(500, 'Internal fault.'), says('Here it is.'));
    const stream = await sendStreamed(kernel, sessionId, 'go');
    await kernel.clock.advance(0);
    expect(fake.requests()).toHaveLength(3);
    expect(retries(stream)).toEqual([{ type: 'retry', attempt: 2, of: 3 }, { type: 'retry', attempt: 3, of: 3 }]);
    const { turn, session } = await turnState(kernel, sessionId);
    expect(turn).toMatchObject({ outcome: 'done', steps: 1 });
    expect(session.usage.input).toBe(turn?.usage.input);
    const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 20 });
    expect(messages.map((message) => message.kind)).toEqual(['user', 'assistant']);
  });

  it('QA3-H22 three transient failures end the turn failed with the last Problem', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply(failure(503, 'one'), failure(503, 'two'), failure(503, 'three'));
    await sendStreamed(kernel, sessionId, 'go');
    await kernel.clock.advance(0);
    expect(fake.requests()).toHaveLength(3);
    const { turn } = await turnState(kernel, sessionId);
    expect(turn?.outcome).toBe('failed');
    const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 20 });
    expect(messages.at(-1)).toMatchObject({ kind: 'notice', content: { code: 'STEP_FAILED', params: { code: 'kvai/PROVIDER_ERROR', details: { model: 'fake/m1', transient: true, reason: expect.stringContaining('three') as unknown } } } });
  });

  it('QA3-E23 a rate limit is retried too', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply(failure(429, 'Rate limit reached.'), says('Fine.'));
    const stream = await sendStreamed(kernel, sessionId, 'go');
    await kernel.clock.advance(0);
    expect(fake.requests()).toHaveLength(2);
    expect(retries(stream)).toEqual([{ type: 'retry', attempt: 2, of: 3 }]);
    expect((await turnState(kernel, sessionId)).turn?.outcome).toBe('done');
  });

  it('QA3-E24 a permanent failure is not retried', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply(failure(400, 'Bad request'), says('never'));
    const stream = await sendStreamed(kernel, sessionId, 'go');
    await kernel.clock.advance(0);
    expect(fake.requests()).toHaveLength(1);
    expect(retries(stream)).toEqual([]);
    expect((await turnState(kernel, sessionId)).turn?.outcome).toBe('failed');
  });

  it('QA3-E25 stopping the turn ends the wait without another request', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply(failure(503, 'Service Unavailable'), says('never'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await vi.waitFor(() => expect(fake.requests()).toHaveLength(1), wait);
    await kernel.exec('kvcoder.turn.cancel', { sessionId });
    await kernel.clock.advance(0);
    expect(fake.requests()).toHaveLength(1);
    expect((await turnState(kernel, sessionId)).turn?.outcome).toBe('cancelled');
  });
});
