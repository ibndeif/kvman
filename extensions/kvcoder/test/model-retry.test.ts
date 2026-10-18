import { describe, expect, it, vi } from 'vitest';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { says } from './support/model-script.ts';
import { kvcoderChunks, newSession, sendStreamed, turnState } from './support/turns.ts';
import { wait } from './support/wait.ts';

const kvcoder = useKvcoder();

// The waits between tries are real time, so a test that reaches the fifth try runs for 80 s.

const failure = (status: number, message: string) => ({ status, body: { error: { message, type: 'server_error' } } });
const retry = (attempt: number, waitMs: number, reason: 'rateLimited' | 'unavailable') => ({ type: 'retry', attempt, of: 5, waitMs, reason });
const retries = (stream: Awaited<ReturnType<typeof sendStreamed>>): unknown[] => kvcoderChunks(stream).filter((chunk) => typeof chunk === 'object' && chunk !== null && 'type' in chunk && chunk.type === 'retry');

describe("a step's model call retried (08 §8.2, ADR 0009, 154, 155, and 203; ADR 0087, 3 and 6)", { timeout: 120_000 }, () => {
  it('QA3-H22 and QA10-H2 a transient failure twice, then an answer: the turn is done after 3 requests, with the retries announced and nothing stored for the failures', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply(failure(503, 'Service Unavailable'), failure(500, 'Internal fault.'), says('Here it is.'));
    const stream = await sendStreamed(kernel, sessionId, 'go');
    await kernel.clock.advance(0);
    expect(fake.requests()).toHaveLength(3);
    expect(retries(stream)).toEqual([retry(2, 1000, 'unavailable'), retry(3, 4000, 'unavailable')]);
    const { turn, session } = await turnState(kernel, sessionId);
    expect(turn).toMatchObject({ outcome: 'done', steps: 1 });
    expect(session.usage.input).toBe(turn?.usage.input);
    const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 20 });
    expect(messages.map((message) => message.kind)).toEqual(['user', 'assistant']);
  });

  it('QA55-E8 and QA10-H2 five transient failures, the last wait 60 s, end the turn failed with the last Problem', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply(failure(503, 'one'), failure(503, 'two'), failure(503, 'three'), failure(503, 'four'), failure(503, 'five'));
    const stream = await sendStreamed(kernel, sessionId, 'go');
    await kernel.clock.advance(0);
    expect(fake.requests()).toHaveLength(5);
    expect(retries(stream)).toEqual([retry(2, 1000, 'unavailable'), retry(3, 4000, 'unavailable'), retry(4, 15_000, 'unavailable'), retry(5, 60_000, 'unavailable')]);
    const { turn } = await turnState(kernel, sessionId);
    expect(turn?.outcome).toBe('failed');
    const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 20 });
    expect(messages.at(-1)).toMatchObject({ kind: 'notice', content: { code: 'STEP_FAILED', params: { code: 'kvai/PROVIDER_ERROR', details: { model: 'fake/m1', transient: true, reason: expect.stringContaining('five') as unknown } } } });
  });

  it('QA3-E23 a rate limit is retried too', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply(failure(429, 'Rate limit reached.'), says('Fine.'));
    const stream = await sendStreamed(kernel, sessionId, 'go');
    await kernel.clock.advance(0);
    expect(fake.requests()).toHaveLength(2);
    expect(retries(stream)).toEqual([retry(2, 1000, 'rateLimited')]);
    expect((await turnState(kernel, sessionId)).turn?.outcome).toBe('done');
  });

  it('QA55-H5 four rate limits, then an answer: waits of 1, 4, 15, and 60 s, and the turn is done', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    const limited = failure(429, 'Rate limit reached.');
    fake.reply(limited, limited, limited, limited, says('Fine.'));
    const stream = await sendStreamed(kernel, sessionId, 'go');
    await kernel.clock.advance(0);
    expect(fake.requests()).toHaveLength(5);
    expect(retries(stream)).toEqual([retry(2, 1000, 'rateLimited'), retry(3, 4000, 'rateLimited'), retry(4, 15_000, 'rateLimited'), retry(5, 60_000, 'rateLimited')]);
    expect((await turnState(kernel, sessionId)).turn?.outcome).toBe('done');
  });

  it('QA55-E9 stopping during the 60 s wait ends the turn without a fifth request', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply(failure(503, 'one'), failure(503, 'two'), failure(503, 'three'), failure(503, 'four'), says('never'));
    const stream = await sendStreamed(kernel, sessionId, 'go');
    // The fourth retry is announced after 20 s of real waits.
    await vi.waitFor(() => expect(retries(stream)).toHaveLength(4), { ...wait, timeout: 40_000 });
    await kernel.exec('kvcoder.turn.cancel', { sessionId });
    await kernel.clock.advance(0);
    expect(fake.requests()).toHaveLength(4);
    expect((await turnState(kernel, sessionId)).turn?.outcome).toBe('cancelled');
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
