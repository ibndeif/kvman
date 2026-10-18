import { describe, expect, it, vi } from 'vitest';
import { z } from '@kvman/sdk';
import type { TestKernel } from '@kvman/testkit';
import type { FakeOpenAI } from '@kvman/testkit/fake-openai';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, fsCall, runs, says, shell, toolResults, type RunCallSpec } from './support/model-script.ts';
import { newSession } from './support/turns.ts';
import { wait } from './support/wait.ts';
import { worker, workers } from './support/workers.ts';

// A background helper that waits on the person says so, and says how far it got (plan 08 §8.5, ADR 0085, 2).

const kvcoder = useKvcoder();
const helperReply = runs(
  { ...fsCall('list', { path: '.' }), description: 'List the folder.' },
  { ...fsCall('list', { path: '.' }), description: 'List it again.' },
  { ...shell('echo hi', { risky: true }), description: 'Say hi in the shell.' },
);
const parsed = (text: string | undefined) => z.record(z.string(), z.unknown()).parse(JSON.parse(text ?? 'null'));
const turnSchema = z.object({ pending: z.array(z.object({ questionId: z.string().nullable() })) });

async function say(kernel: TestKernel, fake: FakeOpenAI, sessionId: string, ...calls: RunCallSpec[]): Promise<string[]> {
  fake.reply(runs(...calls), says('ok'));
  await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
  await kernel.clock.advance(0);
  return toolResults(fake).slice(-calls.length);
}

// A background helper whose first step waits on the approval of its shell line.
async function waitingHelper() {
  const { kernel, fake } = await kvcoder.start({ settings: workers(worker('helper')) });
  const sessionId = await newSession(kernel);
  fake.reply(runs(command('delegate', 'run', { worker: 'helper', title: 'Helper', task: 'Do it', background: true })), helperReply, says('started it'));
  await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
  await kernel.clock.advance(0);
  const helperId = /^started (\S+)/.exec(toolResults(fake, 2)[0] ?? '')?.[1] ?? '';
  await vi.waitFor(async () => expect(await kernel.exec('kvcoder.job.get', { sessionId, id: helperId })).toMatchObject({ status: 'waiting' }), wait);
  await vi.waitFor(async () => expect((await kernel.exec('kvcoder.session.get', { sessionId })).status).toBe('idle'), wait);
  return { kernel, fake, sessionId, helperId };
}

describe('a background helper that waits on the person (ADR 0085, 2)', { timeout: 60_000 }, () => {
  it('QA53-H10 a waiting helper says so and how far it got', async () => {
    const { kernel, fake, sessionId, helperId } = await waitingHelper();
    const { messages } = await kernel.exec('kvcoder.message.list', { sessionId: helperId, limit: 100 });
    const newest = z.object({ createdAt: z.string() }).parse(messages.at(-1)).createdAt;
    const expected = {
      id: helperId,
      kind: 'subagent',
      status: 'waiting',
      waitingFor: ['Say hi in the shell.'],
      progress: { steps: 1, lastActivityAt: newest, recentCalls: ['List the folder.', 'List it again.', 'Say hi in the shell.'] },
    };
    const began = Date.now();
    const [output, waited] = await say(kernel, fake, sessionId, command('background', 'output', { id: helperId }), command('background', 'wait', { id: helperId, timeoutMs: 600_000 }));
    expect(Date.now() - began).toBeLessThan(20_000);
    expect(parsed(output)).toMatchObject(expected);
    expect(parsed(waited)).toMatchObject(expected);
    expect(await kernel.exec('kvcoder.job.get', { sessionId, id: helperId })).toMatchObject(expected);
    const [listed] = await say(kernel, fake, sessionId, command('background', 'list'));
    expect(z.array(z.record(z.string(), z.unknown())).parse(JSON.parse(listed ?? '[]'))).toEqual([expect.objectContaining({ id: helperId, status: 'waiting' })]);
    expect(await kernel.exec('kvcoder.job.list', { sessionId })).toEqual([expect.objectContaining({ id: helperId, status: 'waiting' })]);
  });

  it('QA53-E9 a process has no progress, and an ended helper waits on nothing', async () => {
    const { kernel, fake, sessionId, helperId } = await waitingHelper();
    const [started = ''] = await say(kernel, fake, sessionId, { connector: 'shell', command: 'exec', payload: { line: 'node -e "setTimeout(() => {}, 30000)"', risky: false, background: true } });
    const processId = /^started (\S+)/.exec(started)?.[1] ?? '';
    const [processOutput] = await say(kernel, fake, sessionId, command('background', 'output', { id: processId }));
    expect(parsed(processOutput)).not.toHaveProperty('progress');
    expect(parsed(processOutput)).not.toHaveProperty('waitingFor');
    const [turn] = await kernel.exec('kvcoder.turn.list', { sessionId: helperId, limit: 1 });
    const questionId = turnSchema.parse(turn).pending[0]?.questionId ?? '';
    fake.reply(says('helper done'), says('noted'));
    await kernel.exec('kvcoder.question.answer', { questionId, answer: { confirmed: false } });
    await kernel.clock.advance(0);
    await vi.waitFor(async () => expect(await kernel.exec('kvcoder.job.get', { sessionId, id: helperId })).toMatchObject({ status: 'succeeded' }), wait);
    await vi.waitFor(async () => expect((await kernel.exec('kvcoder.session.get', { sessionId })).status).toBe('idle'), wait);
    const ended = await kernel.exec('kvcoder.job.get', { sessionId, id: helperId });
    expect(ended).toHaveProperty('progress');
    expect(ended).not.toHaveProperty('waitingFor');
    await say(kernel, fake, sessionId, command('background', 'stop', { id: processId }));
  });

  it("QA56-H1 a job list's row is the job's row without its output and progress (ADR 0088, 1)", async () => {
    const { kernel, fake, sessionId, helperId } = await waitingHelper();
    const [turn] = await kernel.exec('kvcoder.turn.list', { sessionId: helperId, limit: 1 });
    fake.reply(says('helper done'), says('noted'));
    await kernel.exec('kvcoder.question.answer', { questionId: turnSchema.parse(turn).pending[0]?.questionId ?? '', answer: { confirmed: false } });
    await kernel.clock.advance(0);
    await vi.waitFor(async () => expect(await kernel.exec('kvcoder.job.get', { sessionId, id: helperId })).toMatchObject({ status: 'succeeded' }), wait);
    await vi.waitFor(async () => expect((await kernel.exec('kvcoder.session.get', { sessionId })).status).toBe('idle'), wait);
    const { output, progress, ...row } = await kernel.exec('kvcoder.job.get', { sessionId, id: helperId });
    expect(output).toEqual(expect.stringContaining('helper done'));
    expect(progress).toMatchObject({ recentCalls: ['List the folder.', 'List it again.', 'Say hi in the shell.'] });
    expect(await kernel.exec('kvcoder.job.list', { sessionId })).toEqual([row]);
  });
});
