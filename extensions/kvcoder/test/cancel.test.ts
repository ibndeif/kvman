import { describe, expect, it, vi } from 'vitest';
import { openGate } from './support/gates.ts';
import { wait } from './support/wait.ts';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { calls, says } from './support/model-script.ts';
import { newSession, turnState } from './support/turns.ts';

const kvcoder = useKvcoder();

describe('cancel (08 §8.1)', { timeout: 30_000 }, () => {
  it('M2.4-H10 cancel stops the children and the questions, and background work still reports back', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    const gate = openGate('h10');
    fake.reply(calls(`todo wait --async '{"gate":"h10","text":"a"}'`, `subagent run '{"task":"Ask them","mode":"fresh"}'`), calls(`ask text '{"prompt":"Name?"}'`), says('after'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await gate.waiting;
    const childId = await vi.waitFor(async () => {
      const id = String((await turnState(kernel, sessionId)).turn?.pending[0]?.childSessionId);
      expect((await turnState(kernel, id)).session.status).toBe('waiting');
      return id;
    }, wait);
    const questionId = String((await turnState(kernel, childId)).turn?.pending[0]?.questionId);
    await kernel.exec('kvcoder.turn.cancel', { sessionId });
    for (const id of [sessionId, childId]) {
      const state = await turnState(kernel, id);
      expect(state.session.status).toBe('idle');
      expect(state.turn).toMatchObject({ outcome: 'cancelled' });
    }
    const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 });
    expect(messages.at(-1)).toMatchObject({ kind: 'notice', content: { code: 'CANCELLED', params: {} } });
    await expect(kernel.exec('kvcoder.question.answer', { questionId, answer: { text: 'x' } })).rejects.toMatchObject({ problem: { code: 'kvcoder/QUESTION_NOT_FOUND' } });
    gate.release();
    await kernel.clock.advance(0);
    const after = await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 });
    expect(after.messages.some((message) => message.source?.kind === 'job')).toBe(true);
  });

  it('M2.4-E49 cancelling an idle session does nothing', async () => {
    const { kernel } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    await kernel.exec('kvcoder.turn.cancel', { sessionId });
    expect(await kernel.exec('kvcoder.message.list', { sessionId, limit: 10 })).toEqual({ messages: [], omitted: 0 });
    expect(await kernel.exec('kvcoder.turn.list', { sessionId, limit: 10 })).toEqual([]);
  });
});
