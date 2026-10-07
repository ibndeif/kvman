import { describe, expect, it } from 'vitest';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { fsCall, runs, says, shell } from './support/model-script.ts';
import { newSession, turnState } from './support/turns.ts';

const kvcoder = useKvcoder();

async function lastNotice(kernel: Awaited<ReturnType<typeof kvcoder.start>>['kernel'], sessionId: string): Promise<unknown> {
  const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 });
  return messages.filter((message) => message.kind === 'notice').at(-1)?.content;
}

describe('turn limits and failures (08 §8.1)', { timeout: 30_000 }, () => {
  it('QA41-H1 kvcoder.maxSteps defaults to null', async () => {
    const { kernel } = await kvcoder.start();
    const settings = await kernel.exec('kernel.settings.list', {});
    expect(settings.find((setting) => setting.key === 'kvcoder.maxSteps')).toMatchObject({ value: null, source: 'default' });
  });

  it('QA41-H2 a turn with no limit completes after 51 calls and a final answer', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    for (let step = 0; step < 51; step += 1) fake.reply(runs(fsCall('list')));
    fake.reply(says('done'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    expect(fake.requests()).toHaveLength(52);
    const { session, turn } = await turnState(kernel, sessionId);
    expect(turn).toMatchObject({ outcome: 'done', steps: 52 });
    expect(session.status).toBe('idle');
    const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 1000 });
    expect(messages.filter((message) => message.kind === 'notice')).toEqual([]);
  });

  it('QA41-H3 clearing a numeric cap lets a turn finish after four steps', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    await kernel.exec('kernel.settings.set', { key: 'kvcoder.maxSteps', value: 2, scope: 'global' });
    await kernel.exec('kernel.settings.set', { key: 'kvcoder.maxSteps', value: null, scope: 'global' });
    fake.reply(runs(fsCall('list')), runs(fsCall('list')), runs(fsCall('list')), says('done'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    expect(fake.requests()).toHaveLength(4);
    expect((await turnState(kernel, sessionId)).turn).toMatchObject({ outcome: 'done', steps: 4 });
  });

  it('QA41-E1 only positive whole numbers and null are accepted', async () => {
    const { kernel } = await kvcoder.start();
    const set = (value: number | string | null) => kernel.exec('kernel.settings.set', { key: 'kvcoder.maxSteps', value, scope: 'global' });
    for (const value of [0, -1, 1.5, 'x']) await expect(set(value)).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
    await expect(set(1)).resolves.toEqual({});
    await expect(set(null)).resolves.toEqual({});
  });

  it("M2.4-E18 at kvcoder.maxSteps the step's results are appended, then the turn ends maxSteps with a notice", async () => {
    const { kernel, fake } = await kvcoder.start({ settings: { 'kvcoder.maxSteps': 2 } });
    const sessionId = await newSession(kernel);
    fake.reply(runs(shell('echo 1')), runs(shell('echo 2')), says('never'));
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
    fake.reply({ status: 400, body: { error: { message: 'Bad request', type: 'invalid_request_error' } } });
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    expect(await lastNotice(kernel, sessionId)).toEqual({ code: 'STEP_FAILED', params: { code: 'kvai/PROVIDER_ERROR', details: { model: 'fake/m1', reason: expect.stringContaining('Bad request') as unknown, transient: false } } });
    const { session, turn } = await turnState(kernel, sessionId);
    expect(session.status).toBe('idle');
    expect(turn).toMatchObject({ outcome: 'failed' });
  });
});
