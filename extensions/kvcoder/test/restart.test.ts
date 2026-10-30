import { describe, expect, it, vi } from 'vitest';
import { wait } from './support/wait.ts';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { answered, command, runs, says, toolResults } from './support/model-script.ts';
import { newSession, turnState } from './support/turns.ts';
import { helperIds } from './support/helpers.ts';

const kvcoder = useKvcoder();

const held = { chunks: [{ wait: new Promise<void>(() => undefined) }] };

async function notices(kernel: Awaited<ReturnType<typeof kvcoder.start>>['kernel'], sessionId: string): Promise<unknown[]> {
  const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 });
  return messages.filter((message) => message.kind === 'notice').map((message) => message.content);
}

// A restart stops and starts kvai, kvwebui, and kvcoder again, which takes a few seconds on a loaded machine.
describe('restarts (08 §8.1, 12 §12.2)', { timeout: 30_000 }, () => {
  it('M2.4-H2 a suspended turn survives a restart, and answering it continues', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply(runs(command('ask', 'confirm', {"prompt":"Go?"})), says('done'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    const before = await turnState(kernel, sessionId);
    await kernel.restart();
    const after = await turnState(kernel, sessionId);
    expect(after.session.status).toBe('waiting');
    expect(after.turn?.pending).toEqual(before.turn?.pending);
    const questionId = String(after.turn?.pending[0]?.questionId);
    await kernel.exec('kvcoder.question.answer', { questionId, answer: { confirmed: true } });
    await kernel.clock.advance(0);
    expect(toolResults(fake)).toEqual([answered('{"confirmed":true}')]);
    expect((await turnState(kernel, sessionId)).turn).toMatchObject({ outcome: 'done' });
  });

  it('M2.4-E50 a step cut off by a restart ends failed with INTERRUPTED, and its turn is interrupted with a notice', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply(held);
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await vi.waitFor(() => expect(fake.requests()).toHaveLength(1), wait);
    const stepJobId = String((await kernel.exec('kvcoder.session.get', { sessionId })).stepJobId);
    await kernel.restart();
    await kernel.clock.advance(0);
    expect(await kernel.waitForJob(stepJobId)).toMatchObject({ status: 'failed', problem: { code: 'INTERRUPTED' } });
    const state = await turnState(kernel, sessionId);
    expect(state.session).toMatchObject({ status: 'idle' });
    expect(state.session.stepJobId).toBeUndefined();
    expect(state.turn).toMatchObject({ outcome: 'interrupted' });
    expect(await notices(kernel, sessionId)).toEqual([{ code: 'INTERRUPTED', params: { code: 'INTERRUPTED' } }]);
  });

  // ADR 0108, 1: the helper runs in the background, so its interrupted step ends its own turn, and its idle lead gets
  // the ending as a message that starts no turn (plan 08 §8.1).
  it("M2.4-E47 a helper's step interrupted by a restart ends its turn, and its lead gets a message and starts no turn", async () => {
    const { kernel, fake, helperFake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply(runs(command('delegate', 'run', { worker: 'general', title: 'Helper', kind: 'find', goal: 'Look around', done: 'It is done.' })), says('Started.'));
    helperFake.reply(held);
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await vi.waitFor(async () => {
      expect(helperFake.requests()).toHaveLength(1);
      expect((await turnState(kernel, sessionId)).session.status).toBe('idle');
    }, wait);
    const [childId = ''] = await helperIds(kernel, sessionId);
    await kernel.restart();
    await kernel.clock.advance(0);
    expect((await turnState(kernel, childId)).turn).toMatchObject({ outcome: 'interrupted' });
    expect((await turnState(kernel, sessionId)).session.status).toBe('idle');
    expect(await kernel.exec('kvcoder.turn.list', { sessionId, limit: 10 })).toHaveLength(1);
    const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 });
    expect(messages.filter((message) => message.source?.kind === 'subagent')).toHaveLength(1);
    expect(fake.requests()).toHaveLength(2);
  });
});
