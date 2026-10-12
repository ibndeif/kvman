import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ProblemError, z, type Json } from '@kvman/sdk';
import type { TestKernel } from '@kvman/testkit';
import type { FakeOpenAI } from '@kvman/testkit/fake-openai';
import { answerControl, answerOwner, answerSnapshot, enqueueAttempts, first, withAnswerWorld } from './support/answer-world.ts';
import { openGate } from './support/gates.ts';
import { answered, command, runs, says, type RunCallSpec } from './support/model-script.ts';
import { newSession } from './support/turns.ts';
import { programWorker, useWorkerPrograms } from './support/worker-programs.ts';
import { workers } from './support/workers.ts';

const answer = (kernel: TestKernel, questionId: string, value: Json, workspaceId?: string) => kernel.exec('kvcoder.question.answer', { questionId, answer: value }, workspaceId === undefined ? {} : { workspaceId });
const text = () => command('ask', 'text', { prompt: 'Boundary question?' });
const missing = { problem: { code: 'kvcoder/QUESTION_NOT_FOUND' } };
const programs = useWorkerPrograms();

async function ask(kernel: TestKernel, fake: FakeOpenAI, sessionId: string, ...calls: RunCallSpec[]) {
  fake.reply(runs(...(calls.length === 0 ? [text()] : calls)), says('finished'));
  await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
  await kernel.clock.advance(0);
  const state = await answerSnapshot(kernel, sessionId);
  expect(state.session.status).toBe('waiting');
  expect(state.questions).toHaveLength(calls.length || 1);
  return state;
}

async function prepared(kernel: TestKernel, workspaceId?: string) {
  const { sessionId } = z.object({ sessionId: z.string() }).parse(await kernel.exec('kvcoder.answer-fixture.prepared', {}, { ...answerOwner, ...(workspaceId === undefined ? {} : { workspaceId }) }));
  return { sessionId, state: await answerSnapshot(kernel, sessionId, workspaceId) };
}

describe('answer receipt retry boundaries (ADR0042)', { timeout: 30_000 }, () => {
  it('cancel before application removes the question without a receipt or retry repair', async () => {
    await withAnswerWorld(async (kernel, fake, sessionId) => {
      const q = first((await ask(kernel, fake, sessionId)).questions);
      await kernel.exec('kvcoder.turn.cancel', { sessionId });
      const cancelled = await answerSnapshot(kernel, sessionId);
      expect(cancelled.session).toMatchObject({ status: 'idle', turnId: null });
      expect(first(cancelled.turns).outcome).toBe('cancelled');
      expect(cancelled.questions).toEqual([]);
      expect(cancelled.receipts).toEqual([]);
      const unrelated = await prepared(kernel);
      await expect(answer(kernel, q.id, { text: 'too late' })).rejects.toMatchObject(missing);
      await kernel.clock.advance(0);
      expect(await answerSnapshot(kernel, sessionId)).toEqual(cancelled);
      expect(await answerSnapshot(kernel, unrelated.sessionId)).toEqual(unrelated.state);
      expect(fake.requests()).toHaveLength(1);
    });
  });

  it('application wins but cancel before enqueue publication returns null and retains the receipt without model replay', async () => {
    await withAnswerWorld(async (kernel, fake, sessionId) => {
      const q = first((await ask(kernel, fake, sessionId)).questions);
      const gateName = q.id + ':cancel-before-publication';
      const gate = openGate(gateName);
      await answerControl(kernel, 'enqueue-gate', gateName);
      const applying = answer(kernel, q.id, { text: 'committed' });
      try {
        await gate.waiting;
        const committed = await answerSnapshot(kernel, sessionId);
        expect(committed.questions).toEqual([]);
        expect(committed.receipts).toHaveLength(1);
        expect(first(committed.receipts)).toMatchObject({ questionId: q.id, turnId: q.turnId });
        expect(first(committed.turns).results).toMatchObject([{ toolCallId: q.toolCallId, text: answered('{"text":"committed"}') }]);
        expect(committed.session).toMatchObject({ status: 'running', stepJobId: null });
        expect(committed.intents.at(-1)).toMatchObject({ phase: 'prepared', jobId: null });
        await kernel.exec('kvcoder.turn.cancel', { sessionId });
        const cancelled = await answerSnapshot(kernel, sessionId);
        expect(first(cancelled.turns).outcome).toBe('cancelled');
        expect(cancelled.receipts).toEqual(committed.receipts);
        gate.release();
        expect(await applying).toEqual({ jobId: null });
        await kernel.clock.advance(0);
        expect(await answerSnapshot(kernel, sessionId)).toEqual(cancelled);
        expect(await answer(kernel, q.id, { text: 'committed' })).toEqual({ jobId: null });
        expect(await answerSnapshot(kernel, sessionId)).toEqual(cancelled);
        expect(await enqueueAttempts(kernel)).toBe(1);
        expect(fake.requests()).toHaveLength(1);
      } finally { gate.release(); await Promise.allSettled([applying]); }
    });
  });

  it('a matching retry after the answered turn ends acknowledges without mutating or recovering work', async () => {
    await withAnswerWorld(async (kernel, fake, sessionId) => {
      const q = first((await ask(kernel, fake, sessionId)).questions);
      await answer(kernel, q.id, { text: 'accepted' });
      await kernel.clock.advance(0);
      const ended = await answerSnapshot(kernel, sessionId);
      expect(ended.session).toMatchObject({ status: 'idle', turnId: null });
      expect(first(ended.turns).outcome).toBe('done');
      expect(ended.receipts).toHaveLength(1);
      const unrelated = await prepared(kernel);
      expect(await answer(kernel, q.id, { text: 'accepted' })).toEqual({ jobId: null });
      await kernel.clock.advance(0);
      expect(await answerSnapshot(kernel, sessionId)).toEqual(ended);
      expect(await answerSnapshot(kernel, unrelated.sessionId)).toEqual(unrelated.state);
      expect(fake.requests()).toHaveLength(2);
    });
  });

  it('an old matching retry cannot answer or attach to a new waiting turn', async () => {
    await withAnswerWorld(async (kernel, fake, sessionId) => {
      const q = first((await ask(kernel, fake, sessionId)).questions);
      await answer(kernel, q.id, { text: 'old answer' });
      await kernel.clock.advance(0);
      const current = await ask(kernel, fake, sessionId);
      const fresh = first(current.questions);
      expect(fresh.turnId).not.toBe(q.turnId);
      expect(current.session.turnId).toBe(fresh.turnId);
      expect(current.receipts).toHaveLength(1);
      const unrelated = await prepared(kernel);
      expect(await answer(kernel, q.id, { text: 'old answer' })).toEqual({ jobId: null });
      await kernel.clock.advance(0);
      expect(await answerSnapshot(kernel, sessionId)).toEqual(current);
      expect(await answerSnapshot(kernel, unrelated.sessionId)).toEqual(unrelated.state);
      expect(fake.requests()).toHaveLength(3);
    });
  });

  it('both live question IDs and retained receipts are workspace scoped and wrong-workspace retries never repair', async () => {
    await withAnswerWorld(async (kernel, fake, sessionId) => {
      const waiting = await ask(kernel, fake, sessionId);
      const q = first(waiting.questions);
      const folder = path.join(kernel.homeFolder, 'answer-boundary-workspace');
      mkdirSync(folder);
      const workspaceId = (await kernel.exec('kernel.workspace.open', { path: folder })).id;
      const foreignSessionId = await newSession(kernel, workspaceId);
      const foreign = await answerSnapshot(kernel, foreignSessionId, workspaceId);
      const unrelated = await prepared(kernel, workspaceId);
      await expect(answer(kernel, q.id, { text: 'accepted' }, workspaceId)).rejects.toMatchObject(missing);
      expect(await answerSnapshot(kernel, sessionId)).toEqual(waiting);
      expect(await answerSnapshot(kernel, foreignSessionId, workspaceId)).toEqual(foreign);
      expect(await answerSnapshot(kernel, unrelated.sessionId, workspaceId)).toEqual(unrelated.state);
      expect(fake.requests()).toHaveLength(1);
      await answer(kernel, q.id, { text: 'accepted' });
      await kernel.clock.advance(0);
      const ended = await answerSnapshot(kernel, sessionId);
      expect(ended.receipts).toHaveLength(1);
      await expect(answer(kernel, q.id, { text: 'accepted' }, workspaceId)).rejects.toMatchObject(missing);
      await kernel.clock.advance(0);
      expect(await answerSnapshot(kernel, sessionId)).toEqual(ended);
      expect(await answerSnapshot(kernel, foreignSessionId, workspaceId)).toEqual(foreign);
      expect(await answerSnapshot(kernel, unrelated.sessionId, workspaceId)).toEqual(unrelated.state);
      expect(await answer(kernel, q.id, { text: 'accepted' })).toEqual({ jobId: null });
      expect(fake.requests()).toHaveLength(2);
    });
  });

  it('unknown and consumed legacy positive delegate approvals have no receipt and fail without repair', async () => {
    programs.install('claude');
    await withAnswerWorld(async (kernel, fake, sessionId) => {
      const waiting = await ask(kernel, fake, sessionId, command('delegate', 'run', { worker: 'cc', title: 'Helper', task: 'say:legacy result' }), text());
      const q = first(waiting.questions.filter(item => item.kind === 'approval'));
      expect(q.question).toMatchObject({ connector: 'delegate', command: 'run' });
      expect(await answer(kernel, q.id, { confirmed: true })).toEqual({ jobId: null });
      await kernel.clock.advance(0);
      const legacy = await answerSnapshot(kernel, sessionId);
      expect(legacy.session.status).toBe('waiting');
      expect(legacy.questions).toHaveLength(1);
      expect(legacy.questions.some(item => item.id === q.id)).toBe(false);
      expect(legacy.receipts).toEqual([]);
      const unrelated = await prepared(kernel);
      for (const questionId of ['unknown-boundary-question', q.id]) {
        await expect(answer(kernel, questionId, { confirmed: true })).rejects.toMatchObject(missing);
        expect(await answerSnapshot(kernel, sessionId)).toEqual(legacy);
        expect(await answerSnapshot(kernel, unrelated.sessionId)).toEqual(unrelated.state);
      }
      expect(fake.requests()).toHaveLength(1);
    }, workers(programWorker('cc', 'claude', { approval: 'ask' })));
  });

  it('a conflicting retry fails validation without raw answer or digest leakage and changes nothing', async () => {
    await withAnswerWorld(async (kernel, fake, sessionId) => {
      const waiting = await ask(kernel, fake, sessionId, text(), text());
      const q = first(waiting.questions);
      const accepted = 'accepted private boundary value';
      const conflicting = 'conflicting private boundary value';
      expect(await answer(kernel, q.id, { text: accepted })).toEqual({ jobId: null });
      const partial = await answerSnapshot(kernel, sessionId);
      const receipt = first(partial.receipts);
      expect(receipt.questionId).toBe(q.id);
      const unrelated = await prepared(kernel);
      let failure: unknown;
      try { await answer(kernel, q.id, { text: conflicting }); }
      catch (error) { failure = error; }
      expect(failure).toBeInstanceOf(ProblemError);
      if (!(failure instanceof ProblemError)) throw new Error('Expected public problem error');
      expect(failure.problem.code).toBe('VALIDATION_FAILED');
      const exposed = JSON.stringify({ message: failure.message, problem: failure.problem });
      expect(exposed).not.toContain(accepted);
      expect(exposed).not.toContain(conflicting);
      expect(exposed).not.toContain(receipt.answerFingerprint);
      expect(exposed).not.toMatch(/[a-f0-9]{64}/i);
      expect(exposed).not.toMatch(/fingerprint|digest/i);
      await kernel.clock.advance(0);
      expect(await answerSnapshot(kernel, sessionId)).toEqual(partial);
      expect(await answerSnapshot(kernel, unrelated.sessionId)).toEqual(unrelated.state);
      expect(fake.requests()).toHaveLength(1);
    });
  });
});
