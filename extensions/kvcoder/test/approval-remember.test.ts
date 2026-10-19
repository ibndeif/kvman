import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { TestKernel } from '@kvman/testkit';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, runs, says, shell, toolResults, type RunCallSpec } from './support/model-script.ts';
import { newSession, turnState } from './support/turns.ts';

const kvcoder = useKvcoder();

// An approval's answer that remembers a rule or carries a reason (08 §8.6, ADR 0091, 3 and 4).
async function waiting(...replies: Parameters<Awaited<ReturnType<typeof kvcoder.start>>['fake']['reply']>) {
  const world = await kvcoder.start({ settings: { 'kvcoder.approval': 'auto' } });
  const sessionId = await newSession(world.kernel);
  world.fake.reply(...replies);
  await world.kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
  await world.kernel.clock.advance(0);
  const questionId = String((await turnState(world.kernel, sessionId)).turn?.pending[0]?.questionId);
  return { ...world, sessionId, questionId };
}

const risky = (line: string): RunCallSpec => shell(line, { risky: true });
const rules = async (kernel: TestKernel): Promise<unknown> => ((await kernel.exec('kernel.settings.list', {})) as { key: string; value: unknown }[]).find((setting) => setting.key === 'kvcoder.approval.allowed')?.value;
const made = (kernel: TestKernel, file: string): boolean => existsSync(path.join(kernel.homeFolder, file));
const refused = { problem: expect.objectContaining({ code: 'VALIDATION_FAILED' }) as unknown };

describe('Always allow and a reason for a denial (08 §8.6, ADR 0091, 3 and 4)', { timeout: 30_000 }, () => {
  it('QA59-H4 Always allow runs the call, saves the rule once in the workspace, and the next call runs without asking', async () => {
    const { kernel, sessionId, questionId } = await waiting(runs(risky('touch first.txt')), runs(risky('touch second.txt')), says('done'));
    await kernel.exec('kvcoder.question.answer', { questionId, answer: { confirmed: true }, remember: { kind: 'line', prefix: 'touch' } });
    await kernel.clock.advance(0);
    expect(made(kernel, 'first.txt')).toBe(true);
    expect(made(kernel, 'second.txt')).toBe(true);
    expect(await rules(kernel)).toEqual([{ kind: 'line', prefix: 'touch' }]);
    expect((await turnState(kernel, sessionId)).session.status).toBe('idle');
  });

  it('QA59-H5 a denial with a reason tells the model the reason', async () => {
    const { kernel, fake, questionId } = await waiting(runs(risky('rm -rf build')), says('ok'));
    await kernel.exec('kvcoder.question.answer', { questionId, answer: { confirmed: false }, reason: 'use pnpm clean instead' });
    await kernel.clock.advance(0);
    expect(toolResults(fake)).toEqual(['denied by the user: use pnpm clean instead']);
  });

  it('QA59-E7 remember and reason only where they belong, and nothing is saved when refused', async () => {
    const { kernel, questionId } = await waiting(runs(risky('touch a.txt')), says('ok'));
    const answer = (input: Record<string, unknown>) => kernel.exec('kvcoder.question.answer', { questionId, ...input } as never);
    await expect(answer({ answer: { confirmed: false }, remember: { kind: 'line', prefix: 'touch' } })).rejects.toMatchObject(refused);
    await expect(answer({ answer: { confirmed: true }, remember: { kind: 'files' } })).rejects.toMatchObject(refused);
    await expect(answer({ answer: { confirmed: true }, reason: 'why not' })).rejects.toMatchObject(refused);
    await expect(answer({ answer: { confirmed: false }, reason: '' })).rejects.toMatchObject(refused);
    await expect(answer({ answer: { confirmed: false }, reason: 'x'.repeat(1001) })).rejects.toMatchObject(refused);
    expect(await rules(kernel)).toEqual([]);
    const text = await waiting(runs(command('ask', 'text', { prompt: 'Name?' })), says('ok'));
    await expect(text.kernel.exec('kvcoder.question.answer', { questionId: text.questionId, answer: { text: 'x' }, remember: { kind: 'files' } })).rejects.toMatchObject(refused);
  });

  it('QA59-E8 a rule already there is not added again', async () => {
    const { kernel, questionId } = await waiting(runs(risky('touch a.txt')), says('ok'));
    await kernel.exec('kernel.settings.set', { key: 'kvcoder.approval.allowed', value: [{ kind: 'line', prefix: 'touch' }], scope: 'workspace' });
    await kernel.exec('kvcoder.question.answer', { questionId, answer: { confirmed: true }, remember: { kind: 'line', prefix: ' touch ' } });
    expect(await rules(kernel)).toEqual([{ kind: 'line', prefix: 'touch' }]);
  });

  it('QA59-E9 and QA59-E11 a retry is acknowledged only with the same reason; one without extras keeps the old fingerprint', async () => {
    const { kernel, questionId } = await waiting(runs(risky('rm x'), risky('rm y')), says('ok'));
    const second = String((await turnState(kernel, (await kernel.exec('kvcoder.session.list', { limit: 1 }))[0]?.id ?? '')).turn?.pending[1]?.questionId);
    await kernel.exec('kvcoder.question.answer', { questionId, answer: { confirmed: false }, reason: 'no' });
    await kernel.exec('kvcoder.question.answer', { questionId, answer: { confirmed: false }, reason: 'no' });
    await expect(kernel.exec('kvcoder.question.answer', { questionId, answer: { confirmed: false }, reason: 'other' })).rejects.toMatchObject(refused);
    await kernel.exec('kvcoder.question.answer', { questionId: second, answer: { confirmed: false } });
    await kernel.exec('kvcoder.question.answer', { questionId: second, answer: { confirmed: false } });
  });
});
