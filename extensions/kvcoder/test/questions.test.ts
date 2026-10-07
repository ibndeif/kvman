import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, requestMessages, runs, says, shell, textOf, toolResults, unstamped } from './support/model-script.ts';
import { newSession, turnState } from './support/turns.ts';

const kvcoder = useKvcoder();

const approvals = { settings: { 'kvcoder.shell.approval': 'ask' } };

describe('questions and approvals (08 §8.1, §8.5)', { timeout: 30_000 }, () => {
  it('M2.4-H3 a message sent while waiting dismisses the question and denies the approval, then runs the next step', async () => {
    const { kernel, fake } = await kvcoder.start(approvals);
    const sessionId = await newSession(kernel);
    fake.reply(runs(command('ask', 'choice', {"prompt":"Which?","multiple":false,"options":[{"id":"a","label":"A"},{"id":"b","label":"B"}]}), shell('touch never.txt')), says('ok'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    const { turn } = await turnState(kernel, sessionId);
    expect(turn?.pending.map((item) => item.kind)).toEqual(['question', 'approval']);
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'skip that' });
    await kernel.clock.advance(0);
    expect(toolResults(fake)).toEqual(['dismissed by the user', 'denied by the user']);
    expect(unstamped(textOf(requestMessages(fake).at(-1)))).toBe('skip that');
    expect(existsSync(path.join(kernel.homeFolder, 'never.txt'))).toBe(false);
    for (const item of turn?.pending ?? []) await expect(kernel.exec('kvcoder.question.answer', { questionId: String(item.questionId), answer: { dismissed: true } })).rejects.toMatchObject({ problem: { code: 'kvcoder/QUESTION_NOT_FOUND' } });
  });

  it('M2.4-H5 a denied shell call reaches the model as denied', async () => {
    const { kernel, fake } = await kvcoder.start(approvals);
    const sessionId = await newSession(kernel);
    fake.reply({ chunks: [{ toolCall: { id: 't1', name: 'run', arguments: { description: 'Make a file.', connector: 'shell', command: 'exec', payload: { line: 'touch made.txt', risky: false } } } }] }, says('ok'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    const { turn } = await turnState(kernel, sessionId);
    expect(turn?.pending).toEqual([{ toolCallId: 't1', kind: 'approval', questionId: expect.any(String) as unknown, question: { description: 'Make a file.', connector: 'shell', command: 'exec', payload: { line: 'touch made.txt', risky: false } }, childSessionId: null }]);
    await kernel.exec('kvcoder.question.answer', { questionId: String(turn?.pending[0]?.questionId), answer: { confirmed: false } });
    await kernel.clock.advance(0);
    expect(toolResults(fake)).toEqual(['denied by the user']);
    expect(existsSync(path.join(kernel.homeFolder, 'made.txt'))).toBe(false);
  });

  it('QA19-H7 several questions in one reply', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply(runs(command('ask', 'choice', { prompt: 'Which?', multiple: false, options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] }), command('ask', 'text', { prompt: 'Name?' })), says('ok'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    const pending = (await turnState(kernel, sessionId)).turn?.pending ?? [];
    expect(pending.map((item) => item.kind)).toEqual(['question', 'question']);
    const [choice, text] = pending;
    expect(await kernel.exec('kvcoder.question.answer', { questionId: String(choice?.questionId), answer: { selected: ['a'] } })).toEqual({ jobId: null });
    expect((await turnState(kernel, sessionId)).session.status).toBe('waiting');
    const { jobId } = await kernel.exec('kvcoder.question.answer', { questionId: String(text?.questionId), answer: { text: 'Ada' } });
    expect(await kernel.waitForJob(String(jobId))).toMatchObject({ name: 'kvcoder.turn.step', status: 'succeeded' });
    await kernel.clock.advance(0);
    expect(toolResults(fake)).toEqual(['{\n  "selected": [\n    "a"\n  ]\n}', '{\n  "text": "Ada"\n}']);
  });

  it('M2.4-E22 answering one of several returns null, and the last answer returns the next step', async () => {
    const { kernel, fake } = await kvcoder.start(approvals);
    const sessionId = await newSession(kernel);
    fake.reply(runs(shell('echo one'), shell('echo two')), says('ok'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    const [first, second] = (await turnState(kernel, sessionId)).turn?.pending ?? [];
    expect(await kernel.exec('kvcoder.question.answer', { questionId: String(second?.questionId), answer: { confirmed: true } })).toEqual({ jobId: null });
    expect((await turnState(kernel, sessionId)).session.status).toBe('waiting');
    const { jobId } = await kernel.exec('kvcoder.question.answer', { questionId: String(first?.questionId), answer: { confirmed: true } });
    expect(await kernel.waitForJob(String(jobId))).toMatchObject({ name: 'kvcoder.turn.step', status: 'succeeded' });
    await kernel.clock.advance(0);
    expect(toolResults(fake)).toEqual(['one\n[exit code 0]', 'two\n[exit code 0]']);
  });
});
