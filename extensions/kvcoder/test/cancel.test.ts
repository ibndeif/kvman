import { describe, expect, it, vi } from 'vitest';
import { wait } from './support/wait.ts';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, runs, says, shell } from './support/model-script.ts';
import { newSession, turnState } from './support/turns.ts';
import { helperIds } from './support/helpers.ts';

const kvcoder = useKvcoder();

describe('cancel (08 §8.1)', { timeout: 30_000 }, () => {
  // ADR 0108, 1: Stop ends the lead's turn and its questions, and leaves its helpers running, a waiting one with its
  // approval still open; background work still reports back.
  it('M2.4-H10 cancel stops the turn and its questions, leaves the helpers, and background work still reports back', async () => {
    const { kernel, fake, helperFake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply(runs(shell('sleep 2; echo finished', { background: true }), command('delegate', 'run', { worker: 'general', title: 'Helper', kind: 'check', goal: 'Ask them', done: 'It is done.' })), runs(command('ask', 'confirm', { prompt: 'Go on?' })), says('after'));
    helperFake.reply(runs(shell('true', { risky: true })));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    const childId = await vi.waitFor(async () => {
      const [id = ''] = await helperIds(kernel, sessionId);
      expect((await turnState(kernel, id)).session.status).toBe('waiting');
      expect((await turnState(kernel, sessionId)).session.status).toBe('waiting');
      return id;
    }, wait);
    const questionId = String((await turnState(kernel, sessionId)).turn?.pending[0]?.questionId);
    await kernel.exec('kvcoder.turn.cancel', { sessionId });
    const lead = await turnState(kernel, sessionId);
    expect(lead.session.status).toBe('idle');
    expect(lead.turn).toMatchObject({ outcome: 'cancelled' });
    expect((await turnState(kernel, childId)).turn?.pending.map((item) => item.kind)).toEqual(['approval']);
    const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 });
    expect(messages.at(-1)).toMatchObject({ kind: 'notice', content: { code: 'CANCELLED', params: {} } });
    await expect(kernel.exec('kvcoder.question.answer', { questionId, answer: { confirmed: true } })).rejects.toMatchObject({ problem: { code: 'kvcoder/QUESTION_NOT_FOUND' } });
    await vi.waitFor(async () => {
      const after = await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 });
      expect(after.messages.some((message) => message.source?.kind === 'job')).toBe(true);
    }, wait);
  });

  it('M2.4-E49 cancelling an idle session does nothing', async () => {
    const { kernel } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    await kernel.exec('kvcoder.turn.cancel', { sessionId });
    expect(await kernel.exec('kvcoder.message.list', { sessionId, limit: 10 })).toEqual({ messages: [], omitted: 0 });
    expect(await kernel.exec('kvcoder.turn.list', { sessionId, limit: 10 })).toEqual([]);
  });
});
