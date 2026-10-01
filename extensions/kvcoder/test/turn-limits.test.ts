import { describe, expect, it } from 'vitest';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { calls, says } from './support/model-script.ts';
import { newSession, turnState } from './support/turns.ts';

const kvcoder = useKvcoder();

async function lastNotice(kernel: Awaited<ReturnType<typeof kvcoder.start>>['kernel'], sessionId: string): Promise<unknown> {
  const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 });
  return messages.filter((message) => message.kind === 'notice').at(-1)?.content;
}

describe('turn limits and failures (08 §8.1)', { timeout: 30_000 }, () => {
  it("M2.4-E18 at kvcoder.maxSteps the step's results are appended, then the turn ends maxSteps with a notice", async () => {
    const { kernel, fake } = await kvcoder.start({ settings: { 'kvcoder.maxSteps': 2 } });
    const sessionId = await newSession(kernel);
    fake.reply(calls('echo 1'), calls('echo 2'), says('never'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    expect(fake.requests()).toHaveLength(2);
    const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 });
    expect(messages.map((message) => message.kind)).toEqual(['user', 'assistant', 'toolResult', 'assistant', 'toolResult', 'notice']);
    expect(await lastNotice(kernel, sessionId)).toEqual({ code: 'MAX_STEPS', params: { steps: 2 } });
    expect((await turnState(kernel, sessionId)).turn).toMatchObject({ outcome: 'maxSteps', steps: 2 });
  });

  it('M2.4-E19 and QA1-H4 a failing model call ends the turn failed with a notice naming the code and keeping the Problem params', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply({ status: 429, body: { error: { message: 'Rate limit reached', type: 'rate_limit' } } });
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    expect(await lastNotice(kernel, sessionId)).toEqual({ code: 'STEP_FAILED', params: { code: 'kvai/RATE_LIMITED', details: { model: 'fake/m1' } } });
    const { session, turn } = await turnState(kernel, sessionId);
    expect(session.status).toBe('idle');
    expect(turn).toMatchObject({ outcome: 'failed' });
  });
});
