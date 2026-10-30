import { describe, expect, it } from 'vitest';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { newSession, turnState } from './support/turns.ts';

// The wait for the connection ends after 30 scheduled tries, and a failure that won't pass never waits (ADR 0108, 15).

const kvcoder = useKvcoder();
const failure = (status: number, message: string) => ({ status, body: { error: { message, type: 'server_error' } } });

describe('the end of the wait for the connection (ADR 0108, 15)', { timeout: 240_000 }, () => {
  it('QA71-E23 after 30 scheduled tries the turn ends failed with STEP_FAILED', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply(...Array.from({ length: 35 }, (_, index) => failure(503, `down ${String(index)}`)));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    for (let tried = 0; tried < 30; tried += 1) await kernel.clock.advance(120_000);
    expect(fake.requests()).toHaveLength(35);
    const { turn, session } = await turnState(kernel, sessionId);
    expect(turn?.outcome).toBe('failed');
    expect(session.status).toBe('idle');
    const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 });
    expect(messages.filter((message) => message.kind === 'notice').map((message) => message.content['code'])).toEqual(['CONNECTION_WAITING', 'STEP_FAILED']);
  });

  it('QA71-E24 a failure that is not temporary ends the turn at once, with no wait', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply(failure(400, 'Bad request.'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    expect(fake.requests()).toHaveLength(1);
    expect((await turnState(kernel, sessionId)).turn?.outcome).toBe('failed');
  });
});
