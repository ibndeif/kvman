import { describe, expect, it, vi } from 'vitest';
import { z } from '@kvman/sdk';
import type { TestKernel } from '@kvman/testkit';
import type { FakeOpenAI } from '@kvman/testkit/fake-openai';
import { heldReply } from './support/held-reply.ts';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, requestMessages, runs, says, textOf, toolResults } from './support/model-script.ts';
import { newSession } from './support/turns.ts';
import { wait } from './support/wait.ts';
import { programWorker, useWorkerPrograms } from './support/worker-programs.ts';
import { worker, workers } from './support/workers.ts';

// `delegate continue` resumes an ended helper with its history (plan 08 §8.5, ADR 0085, 4).

const kvcoder = useKvcoder();
const programs = useWorkerPrograms();
const run = (payload: Record<string, unknown> = {}) => command('delegate', 'run', { worker: 'helper', title: 'Helper', task: 'Do it', ...payload });
const proceed = (id: string, payload: Record<string, unknown> = {}) => command('delegate', 'continue', { id, message: 'Now add the test.', ...payload });
const helperOf = (result: string | undefined): string => /\(helper (\S+)\)$/.exec(result ?? '')?.[1] ?? '';
const helperMessages = async (kernel: TestKernel, id: string) => (await kernel.exec('kvcoder.message.list', { sessionId: id, limit: 100 })).messages.length;

async function send(kernel: TestKernel, sessionId: string, text = 'go'): Promise<void> {
  await kernel.exec('kvcoder.message.send', { sessionId, text });
  await kernel.clock.advance(0);
}

// For a chat with a helper held in its first reply: settling would wait for it, so this waits for the lead's turn.
async function sendBeside(kernel: TestKernel, fake: FakeOpenAI, sessionId: string, requests: number): Promise<void> {
  await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
  await vi.waitFor(async () => {
    expect(fake.requests().length).toBeGreaterThanOrEqual(requests);
    expect((await kernel.exec('kvcoder.session.get', { sessionId })).status).toBe('idle');
  }, wait);
}

// A chat whose foreground helper answered once; the next request is the lead's.
async function answeredHelper(fake: FakeOpenAI, kernel: TestKernel) {
  const sessionId = await newSession(kernel);
  fake.reply(runs(run()), says('first answer'), says('ok'));
  await send(kernel, sessionId);
  const first = toolResults(fake).at(-1);
  return { sessionId, first, id: helperOf(first) };
}

describe('delegate continue (ADR 0085, 4)', { timeout: 60_000 }, () => {
  it('QA53-H12 a helper is continued with its history', async () => {
    const { kernel, fake } = await kvcoder.start({ settings: workers(worker('helper')) });
    const { sessionId, first, id } = await answeredHelper(fake, kernel);
    expect(first).toBe(`first answer\n\n(helper ${id})`);
    const before = await kernel.exec('kvcoder.session.get', { sessionId: id });
    fake.reply(runs(proceed(id)), says('second answer'), says('ok'));
    await send(kernel, sessionId);
    const helperRequest = requestMessages(fake, 4).map((message) => `${message.role}:${textOf(message)}`);
    expect(helperRequest.filter((line) => !line.startsWith('system:') && !line.startsWith('developer:'))).toEqual([expect.stringMatching(/^user:.*Do it/s), 'assistant:first answer', expect.stringMatching(/^user:.*Now add the test\./s)]);
    expect(toolResults(fake).at(-1)).toBe(`second answer\n\n(helper ${id})`);
    const after = await kernel.exec('kvcoder.session.get', { sessionId: id });
    expect({ worker: after.worker, model: after.model, thinking: after.thinking }).toEqual({ worker: before.worker, model: before.model, thinking: before.thinking });

    fake.reply(runs(proceed(id, { message: 'And the docs.', background: true })), says('third answer'), says('ok'), says('noted'));
    await send(kernel, sessionId);
    expect(fake.requests().some((_, index) => toolResults(fake, index).includes(`started ${id}`))).toBe(true);
    await vi.waitFor(async () => {
      const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 });
      expect(JSON.stringify(messages)).toContain(`third answer\\n\\n(helper ${id})`);
    }, wait);
  });

  it("QA53-E11 continue refuses what it can't continue", async () => {
    const { kernel, fake } = await kvcoder.start({ settings: workers(worker('helper')) });
    const { sessionId, id } = await answeredHelper(fake, kernel);
    const other = await newSession(kernel);
    fake.reply(runs(run()), says('other answer'), says('ok'));
    await send(kernel, other);
    const otherHelper = helperOf(toolResults(fake).at(-1));
    const held = heldReply({ text: 'late' });
    fake.reply(runs(run({ background: true })), held.reply, says('ok'));
    await sendBeside(kernel, fake, sessionId, fake.requests().length + 3);
    const busy = /^started (\S+)/.exec(toolResults(fake).at(-1) ?? '')?.[1] ?? '';
    const counted = await helperMessages(kernel, id);
    fake.reply(runs(proceed(busy), proceed('nope'), proceed(otherHelper), command('delegate', 'continue', { id })), says('ok'));
    await sendBeside(kernel, fake, sessionId, fake.requests().length + 2);
    const [stillBusy, unknown, foreign, noMessage] = toolResults(fake).slice(-4);
    expect(stillBusy).toMatch(/^error VALIDATION_FAILED: The helper .* is still working/);
    expect(unknown).toMatch(/^error kvcoder\/JOB_NOT_FOUND: /);
    expect(foreign).toMatch(/^error kvcoder\/JOB_NOT_FOUND: /);
    expect(noMessage).toMatch(/^error VALIDATION_FAILED: /);
    expect(await helperMessages(kernel, id)).toBe(counted);
    await kernel.exec('kvcoder.job.cancel', { sessionId, id: busy });
    held.release();

    // A world of its own: a program worker checks its program at a chat's first step, which reorders the requests.
    programs.install('pi');
    const programWorld = await kvcoder.start({ settings: workers(programWorker('runner', 'pi', { approval: 'auto' })) });
    const programChat = await newSession(programWorld.kernel);
    programWorld.fake.reply(runs(command('delegate', 'run', { worker: 'runner', title: 'Runner', task: 'say:hi' })), says('ok'));
    await send(programWorld.kernel, programChat);
    const runner = (await programWorld.kernel.exec('kvcoder.job.list', { sessionId: programChat })).find((job) => job.kind === 'worker')?.id ?? '';
    programWorld.fake.reply(runs(proceed(runner)), says('ok'));
    await send(programWorld.kernel, programChat);
    expect(toolResults(programWorld.fake).at(-1)).toMatch(/^error VALIDATION_FAILED: .*program worker's run/);
  });

  it('QA53-E12 continue rechecks the grants', async () => {
    const { kernel, fake } = await kvcoder.start({ settings: workers(worker('helper'), worker('other')) });
    const { sessionId, id } = await answeredHelper(fake, kernel);
    const counted = await helperMessages(kernel, id);
    await kernel.exec('kernel.settings.set', { key: 'kvcoder.delegate.workers', value: [worker('helper', { enabled: false }), worker('other')], scope: 'global' });
    fake.reply(runs(proceed(id)), says('ok'));
    await send(kernel, sessionId);
    expect(toolResults(fake).at(-1)).toMatch(/^error kvcoder\/WORKER_NOT_FOUND: There is no worker helper\./);
    expect(await helperMessages(kernel, id)).toBe(counted);
  });

  it("QA53-E13 a failed helper's result still ends with its id", async () => {
    const { kernel, fake } = await kvcoder.start({ settings: workers(worker('helper')) });
    const sessionId = await newSession(kernel);
    const held = heldReply({ text: 'never' });
    fake.reply(runs(run({ background: true })), held.reply, says('ok'));
    await sendBeside(kernel, fake, sessionId, 3);
    const id = /^started (\S+)/.exec(toolResults(fake).at(-1) ?? '')?.[1] ?? '';
    fake.reply(runs(command('background', 'stop', { id })), runs(command('background', 'output', { id })), says('ok'));
    await send(kernel, sessionId);
    const output = z.object({ output: z.string() }).parse(JSON.parse(toolResults(fake).at(-1) ?? '{}')).output;
    expect(output).toMatch(new RegExp(`^subagent ended cancelled[\\s\\S]*\\n\\n\\(helper ${id}\\)$`));
    held.release();
    fake.reply(runs(proceed(id)), says('back again'), says('ok'));
    await send(kernel, sessionId);
    expect(toolResults(fake).at(-1)).toBe(`back again\n\n(helper ${id})`);
  });
});
