import { describe, expect, it } from 'vitest';
import { z, type Json } from '@kvman/sdk';
import type { TestKernel } from '@kvman/testkit';
import type { FakeOpenAI } from '@kvman/testkit/fake-openai';
import { answerControl, answerOwner, answerSnapshot, enqueueAttempts, first, withAnswerWorld } from './support/answer-world.ts';
import { answered, command, runs, says, toolResults, type RunCallSpec } from './support/model-script.ts';
import { openGate } from './support/gates.ts';

const answer = (kernel: TestKernel, questionId: string, value: Json) => kernel.exec('kvcoder.question.answer', { questionId, answer: value });
const text = () => command('ask', 'text', { prompt: 'Private question?' });
async function ask(kernel: TestKernel, fake: FakeOpenAI, sessionId: string, ...calls: RunCallSpec[]) {
  fake.reply(runs(...(calls.length === 0 ? [text()] : calls)), says('ok'));
  await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
  await kernel.clock.advance(0);
  const state = await answerSnapshot(kernel, sessionId);
  expect(state.session.status).toBe('waiting');
  expect(state.questions).toHaveLength(calls.length || 1);
  return state;
}
const missing = { problem: { code: 'kvcoder/QUESTION_NOT_FOUND' } };
const invalid = { problem: { code: 'VALIDATION_FAILED' } };

describe('atomic ordinary answer application (ADR0042 E89–E99)', { timeout: 30_000 }, () => {
  it('rolls the actual answer back completely when successor generation overflows', async () => {
    await withAnswerWorld(async (kernel, fake, sessionId) => {
      const q = first((await ask(kernel, fake, sessionId)).questions);
      await kernel.exec('kvcoder.answer-fixture.patch', { sessionId, mode: 'overflow' }, answerOwner);
      const before = await answerSnapshot(kernel, sessionId);
      await expect(answer(kernel, q.id, { text: 'secret answer' })).rejects.toMatchObject(invalid);
      expect(await answerSnapshot(kernel, sessionId)).toEqual(before);
      expect(fake.requests()).toHaveLength(1);
    });
  });

  it('commits each partial result with its receipt and prepares exactly once at the last answer', async () => {
    await withAnswerWorld(async (kernel, fake, sessionId) => {
      const before = await ask(kernel, fake, sessionId, text(), text());
      const q = first(before.questions), other = first(before.questions.filter(item => item.id !== q.id));
      expect(await answer(kernel, q.id, { text: 'first' })).toEqual({ jobId: null });
      const partial = await answerSnapshot(kernel, sessionId);
      expect(partial.session).toMatchObject({ status: 'waiting', stepGeneration: 1, stepIntentId: null });
      expect(partial.questions.map(item => item.id)).toEqual([other.id]);
      expect(first(partial.turns).results).toEqual([{ toolCallId: q.toolCallId, text: answered('{"text":"first"}'), details: null, isError: false, run: null }]);
      expect(first(partial.turns).pending.map(item => item.toolCallId)).toEqual([other.toolCallId]);
      expect(first(partial.receipts)).toMatchObject({ questionId: q.id, sessionId, turnId: q.turnId, toolCallId: q.toolCallId, questionKind: 'text', answerFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/) });
      expect(Object.keys(first(partial.receipts)).sort()).toEqual(['answerFingerprint', 'createdAt', 'id', 'questionId', 'questionKind', 'sessionId', 'toolCallId', 'turnId'].sort());
      expect(JSON.stringify(partial.receipts)).not.toContain('Private question?');
      expect(JSON.stringify(partial.receipts)).not.toContain('first');
      expect(await answer(kernel, q.id, { text: 'first' })).toEqual({ jobId: null });
      expect(await answerSnapshot(kernel, sessionId)).toEqual(partial);
      await expect(answer(kernel, q.id, { text: 'different secret' })).rejects.toMatchObject(invalid);
      expect(await answerSnapshot(kernel, sessionId)).toEqual(partial);
      await answer(kernel, other.id, { dismissed: true });
      await kernel.clock.advance(0);
      const ended = await answerSnapshot(kernel, sessionId);
      expect(ended.receipts).toHaveLength(2);
      expect(ended.intents.map(item => item.generation)).toEqual([1, 2]);
      expect(fake.requests()).toHaveLength(2);
      expect(toolResults(fake).sort()).toEqual([answered('{"dismissed":true}'), answered('{"text":"first"}')].sort());
    });
  });

  it('acknowledges matching concurrent retries and rejects conflicts without recovery or duplicate effects', async () => {
    await withAnswerWorld(async (kernel, fake, sessionId) => {
      const q = first((await ask(kernel, fake, sessionId, command('ask', 'choice', { prompt: 'Which?', multiple: true, other: true, options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] }))).questions);
      const gate = openGate(q.id + ':answer');
      await answerControl(kernel, 'enqueue-gate', q.id + ':answer');
      const applying = answer(kernel, q.id, { selected: ['a', 'b'], other: 'private other' });
      try {
        await gate.waiting;
        const committed = await answerSnapshot(kernel, sessionId);
        expect(committed.receipts).toHaveLength(1);
        expect(committed.questions).toHaveLength(0);
        expect(first(committed.turns)).toMatchObject({ pending: [], results: [{ toolCallId: q.toolCallId }] });
        expect(committed.session).toMatchObject({ status: 'running', stepGeneration: 2, stepJobId: null });
        const other = z.object({ sessionId: z.string() }).parse(await kernel.exec('kvcoder.answer-fixture.prepared', {}, answerOwner));
        const unrelated = await answerSnapshot(kernel, other.sessionId);
        const same = await Promise.all([answer(kernel, q.id, { other: 'private other', selected: ['a', 'b'] }), answer(kernel, q.id, { selected: ['a', 'b'], other: 'private other' })]);
        expect(same).toEqual([{ jobId: null }, { jobId: null }]);
        await expect(answer(kernel, q.id, { selected: ['b', 'a'], other: 'private other' })).rejects.toMatchObject(invalid);
        expect(await answerSnapshot(kernel, sessionId)).toEqual(committed);
        expect(await answerSnapshot(kernel, other.sessionId)).toEqual(unrelated);
        expect(await enqueueAttempts(kernel)).toBe(1);
        gate.release(); await applying; await kernel.clock.advance(0);
        expect(fake.requests()).toHaveLength(2);
        expect((await answerSnapshot(kernel, sessionId)).intents).toHaveLength(2);
      } finally { gate.release(); await Promise.allSettled([applying]); }
    });
  });

  it('rolls back even after receipt/result/question/intent transitions have all executed', async () => {
    await withAnswerWorld(async (kernel, fake, sessionId) => {
      const q = first((await ask(kernel, fake, sessionId)).questions);
      await answerControl(kernel, 'rollback');
      const before = await answerSnapshot(kernel, sessionId);
      await expect(answer(kernel, q.id, { text: 'private answer' })).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED', message: 'Fixture rollback after answer transition.' } });
      expect(await answerSnapshot(kernel, sessionId)).toEqual(before);
      expect(await enqueueAttempts(kernel)).toBe(0);
      await answerControl(kernel, 'none');
      await answer(kernel, q.id, { text: 'private answer' }); await kernel.clock.advance(0);
      expect((await answerSnapshot(kernel, sessionId)).receipts).toHaveLength(1);
      expect(fake.requests()).toHaveLength(2);
    });
  });

  it('retains committed application after enqueue failure, but a receipt retry never dispatches it', async () => {
    await withAnswerWorld(async (kernel, fake, sessionId) => {
      const q = first((await ask(kernel, fake, sessionId)).questions);
      await answerControl(kernel, 'enqueue-fail');
      await expect(answer(kernel, q.id, { text: 'accepted' })).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED', message: 'Fixture enqueue failure.' } });
      const committed = await answerSnapshot(kernel, sessionId);
      expect(committed.receipts).toHaveLength(1);
      expect(committed.questions).toHaveLength(0);
      expect(committed.session).toMatchObject({ status: 'running', stepGeneration: 2, stepJobId: null });
      expect(committed.intents.at(-1)).toMatchObject({ phase: 'prepared', jobId: null });
      expect(await answer(kernel, q.id, { text: 'accepted' })).toEqual({ jobId: null });
      expect(await answerSnapshot(kernel, sessionId)).toEqual(committed);
      expect(await enqueueAttempts(kernel)).toBe(1);
      expect(fake.requests()).toHaveLength(1);
    });
  });

  it.each(['stale-turn', 'stale-call', 'stale-kind'] as const)('rejects exact %s binding mismatches without mutation', async mode => {
    await withAnswerWorld(async (kernel, fake, sessionId) => {
      const q = first((await ask(kernel, fake, sessionId)).questions);
      await kernel.exec('kvcoder.answer-fixture.patch', { sessionId, mode }, answerOwner);
      const before = await answerSnapshot(kernel, sessionId);
      await expect(answer(kernel, q.id, { text: 'not applicable' })).rejects.toMatchObject(missing);
      expect(await answerSnapshot(kernel, sessionId)).toEqual(before);
      expect(fake.requests()).toHaveLength(1);
    });
  });
});
