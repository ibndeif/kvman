import { describe, expect, it } from 'vitest';
import { jobSchema } from '@kvman/sdk';
import type { FakeReply } from '@kvman/testkit/fake-openai';
import { answerControl, answerOwner, answerSnapshot, enqueueAttempts, first, withAnswerWorld } from './support/answer-world.ts';
import { command, runs } from './support/model-script.ts';
import { newSession } from './support/turns.ts';
import { openGate } from './support/gates.ts';

const input = (questionId: string) => ({ questionId, answer: { text: 'accepted' } });
// The fake server accesses `wait` only after receiving this exact model request; no polling or clock assumption.
function modelGate(): { reply: FakeReply; waiting: Promise<void>; release(): void } {
  let started = (): void => undefined, release = (): void => undefined;
  const waiting = new Promise<void>(resolve => { started = resolve; });
  const wait = new Promise<void>(resolve => { release = resolve; });
  return { reply: { chunks: [{ get wait() { started(); return wait; } }, { text: 'done' }] }, waiting, release: () => release() };
}

describe('read-only receipt current-job hints (ADR0042 E96)', { timeout: 30_000 }, () => {
  it('returns only the verified current reference in the receipt same active turn', async () => {
    await withAnswerWorld(async (kernel, fake, sessionId) => {
      const model = modelGate();
      try {
        fake.reply(runs(command('ask', 'text', { prompt: 'Name?' })), model.reply);
        await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' }); await kernel.clock.advance(0);
        const q = first((await answerSnapshot(kernel, sessionId)).questions);
        const applied = await kernel.exec('kvcoder.question.answer', input(q.id));
        expect(applied.jobId).not.toBeNull(); await model.waiting;
        const committed = await answerSnapshot(kernel, sessionId);
        expect(await kernel.exec('kvcoder.question.answer', input(q.id))).toEqual(applied);
        expect(await answerSnapshot(kernel, sessionId)).toEqual(committed);
        expect(fake.requests()).toHaveLength(2);
        model.release(); await kernel.clock.advance(0);
        expect(await kernel.exec('kvcoder.question.answer', input(q.id))).toEqual({ jobId: null });
      } finally { model.release(); }
    });
  });

  it('does not trust or cancel a saved job for another session, even with the same command/workspace', async () => {
    await withAnswerWorld(async (kernel, fake, sessionId) => {
      const ownModel = modelGate(), otherModel = modelGate();
      try {
        fake.reply(runs(command('ask', 'text', { prompt: 'Name?' })), ownModel.reply, otherModel.reply);
        await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' }); await kernel.clock.advance(0);
        const q = first((await answerSnapshot(kernel, sessionId)).questions);
        await kernel.exec('kvcoder.question.answer', input(q.id)); await ownModel.waiting;
        const otherId = await newSession(kernel);
        await kernel.exec('kvcoder.message.send', { sessionId: otherId, text: 'other' }); await otherModel.waiting;
        const other = await answerSnapshot(kernel, otherId), jobId = other.session.stepJobId;
        if (jobId === null) throw new Error('Other current job missing');
        const foreignJob = jobSchema.parse(await kernel.exec('kernel.jobs.get', { id: jobId }));
        await kernel.exec('kvcoder.answer-fixture.patch', { sessionId, mode: 'saved-job', jobId }, answerOwner);
        const before = await answerSnapshot(kernel, sessionId);
        expect(await kernel.exec('kvcoder.question.answer', input(q.id))).toEqual({ jobId: null });
        expect(await answerSnapshot(kernel, sessionId)).toEqual(before);
        expect(await answerSnapshot(kernel, otherId)).toEqual(other);
        expect(jobSchema.parse(await kernel.exec('kernel.jobs.get', { id: jobId }))).toEqual(foreignJob);
        expect(fake.requests()).toHaveLength(3);
      } finally { ownModel.release(); otherModel.release(); }
    });
  });

  it('treats an absent saved job as no hint without interrupting or repairing the receipt turn', async () => {
    await withAnswerWorld(async (kernel, fake, sessionId) => {
      const model = modelGate();
      try {
        fake.reply(runs(command('ask', 'text', { prompt: 'Name?' })), model.reply);
        await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' }); await kernel.clock.advance(0);
        const q = first((await answerSnapshot(kernel, sessionId)).questions);
        await kernel.exec('kvcoder.question.answer', input(q.id)); await model.waiting;
        await kernel.exec('kvcoder.answer-fixture.patch', { sessionId, mode: 'saved-job', jobId: 'missing-job' }, answerOwner);
        const before = await answerSnapshot(kernel, sessionId);
        expect(await kernel.exec('kvcoder.question.answer', input(q.id))).toEqual({ jobId: null });
        expect(await answerSnapshot(kernel, sessionId)).toEqual(before);
        expect(fake.requests()).toHaveLength(2);
      } finally { model.release(); }
    });
  });

  it('rechecks the receipt turn after awaiting metadata and never returns a replacement turn job', async () => {
    await withAnswerWorld(async (kernel, fake, sessionId) => {
      const oldModel = modelGate(), newModel = modelGate();
      try {
        fake.reply(runs(command('ask', 'text', { prompt: 'Name?' })), oldModel.reply, newModel.reply);
        await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' }); await kernel.clock.advance(0);
        const q = first((await answerSnapshot(kernel, sessionId)).questions);
        await kernel.exec('kvcoder.question.answer', input(q.id)); await oldModel.waiting;
        const name = q.id + ':metadata', gate = openGate(name);
        await answerControl(kernel, 'metadata-gate', name);
        const retry = kernel.exec('kvcoder.question.answer', input(q.id));
        try {
          await gate.waiting;
          await kernel.exec('kvcoder.turn.cancel', { sessionId });
          await kernel.exec('kvcoder.message.send', { sessionId, text: 'replacement' }); await newModel.waiting;
          const replacement = await answerSnapshot(kernel, sessionId);
          expect(replacement.session.turnId).not.toBe(q.turnId);
          expect(replacement.session.stepJobId).not.toBeNull();
          const attempts = await enqueueAttempts(kernel);
          gate.release(); expect(await retry).toEqual({ jobId: null });
          expect(await answerSnapshot(kernel, sessionId)).toEqual(replacement);
          expect(await enqueueAttempts(kernel)).toBe(attempts);
          expect(fake.requests()).toHaveLength(3);
        } finally { gate.release(); await Promise.allSettled([retry]); }
      } finally { oldModel.release(); newModel.release(); }
    });
  });
});
