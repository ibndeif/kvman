import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { z, type Json } from '@kvman/sdk';
import type { TestKernel } from '@kvman/testkit';
import type { FakeOpenAI } from '@kvman/testkit/fake-openai';
import { answerFingerprint } from '../src/turns/answer-fingerprint.ts';
import { answerOwner, answerSnapshot, first, withAnswerWorld } from './support/answer-world.ts';
import { command, runs, says, shell, toolResults, type RunCallSpec } from './support/model-script.ts';
import { programWorker, useWorkerPrograms } from './support/worker-programs.ts';
import { workers } from './support/workers.ts';

const programs = useWorkerPrograms();
const answer = (kernel: TestKernel, questionId: string, value: Json) => kernel.exec('kvcoder.question.answer', { questionId, answer: value });
const text = () => command('ask', 'text', { prompt: 'Name?' });
const delegate = (background = false) => command('delegate', 'run', { worker: 'pie', title: 'Helper', task: 'say:hello', background });
async function ask(kernel: TestKernel, fake: FakeOpenAI, sessionId: string, ...calls: RunCallSpec[]) {
  fake.reply(runs(...calls), says('ok'), says('background done'));
  await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
  await kernel.clock.advance(0);
  const state = await answerSnapshot(kernel, sessionId);
  expect(state.session.status).toBe('waiting');
  return state;
}
const invalid = { problem: { code: 'VALIDATION_FAILED' } };

describe('ordinary decisions and legacy delegate grants (ADR0042)', { timeout: 30_000 }, () => {
  it.each([false, true])('serializes simultaneous first answers, conflicting=%s, with one held result and receipt', async conflicting => {
    await withAnswerWorld(async (kernel, fake, sessionId) => {
      const q = first((await ask(kernel, fake, sessionId, text(), text())).questions);
      const settled = await Promise.allSettled([answer(kernel, q.id, { text: 'first secret' }), answer(kernel, q.id, { text: conflicting ? 'second secret' : 'first secret' })]);
      expect(settled.filter(item => item.status === 'fulfilled')).toHaveLength(conflicting ? 1 : 2);
      const failures = settled.filter(item => item.status === 'rejected');
      expect(failures).toHaveLength(conflicting ? 1 : 0);
      if (conflicting) {
        const failure = first(failures);
        const problem = z.object({ problem: z.object({ code: z.literal('VALIDATION_FAILED'), message: z.string(), params: z.record(z.string(), z.json()) }) }).parse(failure.reason).problem;
        expect(problem).toEqual({ code: 'VALIDATION_FAILED', message: 'This question already has a different answer.', params: {} });
      }
      const state = await answerSnapshot(kernel, sessionId), turn = first(state.turns);
      expect(state.receipts).toHaveLength(1);
      expect(state.questions).toHaveLength(1);
      expect(state.session).toMatchObject({ status: 'waiting', stepGeneration: 1 });
      expect(turn.results).toHaveLength(1);
      const applied = z.object({ text: z.string() }).parse(JSON.parse(first(turn.results).text.split('\n', 1)[0] ?? ''));
      expect(['first secret', ...(conflicting ? ['second secret'] : [])]).toContain(applied.text);
      expect(first(state.receipts).answerFingerprint).toBe(answerFingerprint('text', applied));
      expect(turn.pending).toHaveLength(1);
      expect(state.intents).toHaveLength(1);
      expect(fake.requests()).toHaveLength(1);
      await kernel.exec('kvcoder.turn.cancel', { sessionId });
    });
  });

  it('records a normal grant before executing the held call and never repeats its external effect', async () => {
    await withAnswerWorld(async (kernel, fake, sessionId) => {
      const before = await ask(kernel, fake, sessionId, shell('printf x >> once.txt', { risky: true }), text());
      const q = first(before.questions.filter(item => item.kind === 'approval')), remaining = first(before.questions.filter(item => item.kind === 'text'));
      await answer(kernel, q.id, { confirmed: true });
      const partial = await answerSnapshot(kernel, sessionId);
      expect(first(partial.receipts).answerFingerprint).toBe(answerFingerprint('approval', { confirmed: true }));
      expect(first(first(partial.turns).results).run).toEqual(q.question);
      expect(existsSync(path.join(kernel.homeFolder, 'once.txt'))).toBe(false);
      expect(await answer(kernel, q.id, { confirmed: true })).toEqual({ jobId: null });
      expect(await answerSnapshot(kernel, sessionId)).toEqual(partial);
      await expect(answer(kernel, q.id, { confirmed: false })).rejects.toMatchObject(invalid);
      await answer(kernel, remaining.id, { text: 'continue' }); await kernel.clock.advance(0);
      expect(readFileSync(path.join(kernel.homeFolder, 'once.txt'), 'utf8')).toBe('x');
      const ended = await answerSnapshot(kernel, sessionId);
      expect(await answer(kernel, q.id, { confirmed: true })).toEqual({ jobId: null });
      expect(await answerSnapshot(kernel, sessionId)).toEqual(ended);
      expect(readFileSync(path.join(kernel.homeFolder, 'once.txt'), 'utf8')).toBe('x');
      expect(fake.requests()).toHaveLength(2);
      expect(toolResults(fake).filter(item => item === '[exit code 0]')).toHaveLength(1);
    });
  });

  it.each([{ confirmed: false }, { dismissed: true }])('ordinary approval denial/dismissal %j shares one false receipt and executes nothing', async decision => {
    await withAnswerWorld(async (kernel, fake, sessionId) => {
      const q = first((await ask(kernel, fake, sessionId, shell('printf x >> denied.txt', { risky: true }))).questions);
      await answer(kernel, q.id, decision); await kernel.clock.advance(0);
      const ended = await answerSnapshot(kernel, sessionId);
      expect(ended.receipts).toHaveLength(1);
      expect(first(ended.receipts).answerFingerprint).toBe(answerFingerprint('approval', { confirmed: false }));
      expect(await answer(kernel, q.id, { confirmed: false })).toEqual({ jobId: null });
      expect(await answer(kernel, q.id, { dismissed: true })).toEqual({ jobId: null });
      await expect(answer(kernel, q.id, { confirmed: true })).rejects.toMatchObject(invalid);
      expect(await answerSnapshot(kernel, sessionId)).toEqual(ended);
      expect(existsSync(path.join(kernel.homeFolder, 'denied.txt'))).toBe(false);
      expect(toolResults(fake, 1)).toEqual(['denied by the user']);
      expect(fake.requests()).toHaveLength(2);
    });
  });

  it.each([{ confirmed: false }, { dismissed: true }])('delegate denial/dismissal %j is ordinary atomic application without a launch', async decision => {
    const installed = programs.install('pi');
    await withAnswerWorld(async (kernel, fake, sessionId) => {
      const q = first((await ask(kernel, fake, sessionId, delegate())).questions);
      await answer(kernel, q.id, decision); await kernel.clock.advance(0);
      const ended = await answerSnapshot(kernel, sessionId);
      expect(first(ended.receipts)).toMatchObject({ questionKind: 'approval', answerFingerprint: answerFingerprint('approval', { confirmed: false }) });
      expect(ended.runs).toEqual([]);
      expect(await answer(kernel, q.id, { dismissed: true })).toEqual({ jobId: null });
      expect(await answerSnapshot(kernel, sessionId)).toEqual(ended);
      expect(installed.calls('pi')).toEqual([]);
      expect(toolResults(fake, 1)).toEqual(['denied by the user']);
    }, workers(programWorker('pie', 'pi', { approval: 'ask' })));
  });

  it.each([false, true])('preserves legacy positive delegate launch, background=%s, without falsely proving it by receipt', async background => {
    const installed = programs.install('pi');
    await withAnswerWorld(async (kernel, fake, sessionId) => {
      const q = first((await ask(kernel, fake, sessionId, delegate(background))).questions);
      await answer(kernel, q.id, { confirmed: true });
      const launched = await answerSnapshot(kernel, sessionId), run = first(launched.runs);
      expect(launched.receipts).toEqual([]);
      expect(launched.questions).toEqual([]);
      if (run.jobId === null) throw new Error('Legacy launch must publish its existing job reference');
      expect((await kernel.waitForJob(run.jobId)).status).toBe('succeeded');
      await kernel.clock.advance(0);
      expect(installed.calls('pi')).toHaveLength(1);
      await expect(answer(kernel, q.id, { confirmed: true })).rejects.toMatchObject({ problem: { code: 'kvcoder/QUESTION_NOT_FOUND' } });
      expect((await answerSnapshot(kernel, sessionId)).receipts).toEqual([]);
      expect(installed.calls('pi')).toHaveLength(1);
    }, workers(programWorker('pie', 'pi', { approval: 'ask' })));
  });

  it('preserves positive delegate refusal/resumption without inventing a launch receipt', async () => {
    const installed = programs.install('pi');
    await withAnswerWorld(async (kernel, fake, sessionId) => {
      const q = first((await ask(kernel, fake, sessionId, delegate())).questions);
      await kernel.exec('kernel.settings.set', { key: 'kvcoder.delegate.workers', value: [], scope: 'global' });
      await answer(kernel, q.id, { confirmed: true }); await kernel.clock.advance(0);
      const ended = await answerSnapshot(kernel, sessionId);
      expect(ended.receipts).toEqual([]);
      expect(ended.runs).toEqual([]);
      expect(ended.session.status).toBe('idle');
      expect(installed.calls('pi')).toEqual([]);
      expect(toolResults(fake, 1)).toEqual(['error kvcoder/WORKER_NOT_FOUND: There is no worker pie. No worker is available.']);
      await expect(kernel.exec('kvcoder.question.answer', { questionId: q.id, answer: { confirmed: true } }, answerOwner)).rejects.toMatchObject({ problem: { code: 'NOT_PUBLIC' } });
    }, workers(programWorker('pie', 'pi', { approval: 'ask' })));
  });
});
