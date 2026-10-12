import { describe, expect, it } from 'vitest';
import type { TestKernel } from '@kvman/testkit';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, runs, says } from './support/model-script.ts';
import { newSession, turnState } from './support/turns.ts';

const kvcoder = useKvcoder();
const asks = () => runs(command('ask', 'text', { prompt: 'Name?' }));

async function waitingTurn(kernel: TestKernel, sessionId: string, text: string): Promise<string> {
  await kernel.exec('kvcoder.message.send', { sessionId, text });
  await kernel.clock.advance(0);
  const state = await turnState(kernel, sessionId);
  expect(state.session.status).toBe('waiting');
  if (state.turn === undefined) throw new Error('Expected a waiting turn');
  return state.turn.id;
}

describe('Stop is tied to the displayed turn (KVC-21, ADR 0049)', { timeout: 30_000 }, () => {
  it('M2.4-E142 a waiting turn is cancelled by its turnId, and without one as before', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply(asks(), asks());
    const first = await waitingTurn(kernel, sessionId, 'go');
    const questionId = String((await turnState(kernel, sessionId)).turn?.pending[0]?.questionId);
    expect(await kernel.exec('kvcoder.turn.cancel', { sessionId, turnId: first })).toEqual({});
    expect(await turnState(kernel, sessionId)).toMatchObject({ session: { status: 'idle' }, turn: { id: first, outcome: 'cancelled' } });
    await expect(kernel.exec('kvcoder.question.answer', { questionId, answer: { text: 'x' } })).rejects.toMatchObject({ problem: { code: 'kvcoder/QUESTION_NOT_FOUND' } });
    const second = await waitingTurn(kernel, sessionId, 'again');
    await kernel.exec('kvcoder.turn.cancel', { sessionId });
    expect(await turnState(kernel, sessionId)).toMatchObject({ session: { status: 'idle' }, turn: { id: second, outcome: 'cancelled' } });
  });

  it("M2.4-E142 an ended turn's id, or one the session never had, leaves the current turn alone", async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply(says('Done.'), asks());
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    const ended = (await turnState(kernel, sessionId)).turn;
    expect(ended).toMatchObject({ outcome: 'done' });
    const current = await waitingTurn(kernel, sessionId, 'again');
    for (const turnId of [String(ended?.id), 'never-a-turn']) expect(await kernel.exec('kvcoder.turn.cancel', { sessionId, turnId })).toEqual({});
    const state = await turnState(kernel, sessionId);
    expect(state.session.status).toBe('waiting');
    expect(state.turn?.id).toBe(current);
    expect(state.turn?.outcome).toBeUndefined();
    const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 });
    expect(messages.some((message) => message.kind === 'notice')).toBe(false);
  });
});
