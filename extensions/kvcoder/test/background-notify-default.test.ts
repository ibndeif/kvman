import { describe, expect, it, vi } from 'vitest';
import type { TestKernel } from '@kvman/testkit';
import type { FakeOpenAI } from '@kvman/testkit/fake-openai';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, runs, says, toolResults, type RunCallSpec } from './support/model-script.ts';
import { newSession } from './support/turns.ts';
import { wait } from './support/wait.ts';

// A background line wakes its idle chat when it ends unless its call set `notify: false` (plan 08 §8.3, ADR 0125).

const kvcoder = useKvcoder();
const line = (milliseconds: number, notify?: boolean): RunCallSpec => ({ connector: 'shell', command: 'exec', payload: { line: `node -e "setTimeout(() => {}, ${String(milliseconds)})"`, risky: false, background: true, ...(notify === undefined ? {} : { notify }) } });

type Listed = { kind: string; content: Record<string, unknown> };
const finished = async (kernel: TestKernel, sessionId: string, text: string): Promise<Listed[]> =>
  ((await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 })).messages as Listed[]).filter((message) => message.kind === 'user' && JSON.stringify(message.content).includes(text));
const turnCount = async (kernel: TestKernel, sessionId: string): Promise<number> => (await kernel.exec('kvcoder.turn.list', { sessionId, limit: 10 })).length;

async function idle(kernel: TestKernel, fake: FakeOpenAI, sessionId: string, requests: number): Promise<void> {
  await vi.waitFor(async () => {
    expect(fake.requests().length).toBe(requests);
    expect((await kernel.exec('kvcoder.session.get', { sessionId })).status).toBe('idle');
  }, { timeout: 30_000, interval: 100 });
}

// Its end is appended in the transaction that would open a turn, so once the message is there no turn started.
async function quietEnd(kernel: TestKernel, sessionId: string, text: string): Promise<void> {
  await vi.waitFor(async () => expect(await finished(kernel, sessionId, text)).toHaveLength(1), { timeout: 30_000, interval: 100 });
  expect((await kernel.exec('kvcoder.session.get', { sessionId })).status).toBe('idle');
  expect(await turnCount(kernel, sessionId)).toBe(1);
}

async function running(kernel: TestKernel, sessionId: string): Promise<void> {
  await vi.waitFor(async () => expect((await kernel.exec('kvcoder.job.list', { sessionId }))[0]?.status).toBe('running'), wait);
}

async function chatWith(spec: RunCallSpec, replies: string[]) {
  const world = await kvcoder.start();
  const sessionId = await newSession(world.kernel);
  world.fake.reply(runs(spec), ...replies.map((text) => says(text)));
  await world.kernel.exec('kvcoder.message.send', { sessionId, text: 'build it' });
  await idle(world.kernel, world.fake, sessionId, 2);
  const [job] = await world.kernel.exec('kvcoder.job.list', { sessionId });
  return { ...world, sessionId, jobId: job?.id ?? '' };
}

describe('a background line wakes its chat by default (ADR 0125)', { timeout: 60_000 }, () => {
  it('QA81-H1 a background line with no notify wakes the idle chat when it ends', async () => {
    const { kernel, fake, sessionId } = await chatWith(line(2500), ['Building; I go on when it ends.', 'It finished.']);
    await idle(kernel, fake, sessionId, 3);
    expect(JSON.stringify(fake.requests().at(-1))).toContain(') finished:');
    expect(await turnCount(kernel, sessionId)).toBe(2);
  });

  it('QA81-H2 notify is described as on by default and off for a server', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply(runs(command('shell', 'help', { command: 'exec' })), says('ok'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await idle(kernel, fake, sessionId, 2);
    expect(toolResults(fake)[0]).toContain('With background, true by default: the line wakes this chat when it ends, so you can end your turn and go on when its result comes, such as a build, a download, or a long test. Set it to false for a server.');
  });

  it('QA81-E1 notify false keeps a line quiet: its end is told and starts no turn', async () => {
    const { kernel, sessionId } = await chatWith(line(2500, false), ['started', 'never']);
    await quietEnd(kernel, sessionId, ') finished:');
  });

  it('QA81-E2 a restart keeps the line\'s notify', async () => {
    const woken = await chatWith(line(5000), ['started', 'It finished.']);
    await running(woken.kernel, woken.sessionId);
    await woken.kernel.exec('kvcoder.job.restart', { sessionId: woken.sessionId, id: woken.jobId });
    await idle(woken.kernel, woken.fake, woken.sessionId, 3);
    expect(await turnCount(woken.kernel, woken.sessionId)).toBe(2);

    const quiet = await chatWith(line(5000, false), ['started', 'never']);
    await running(quiet.kernel, quiet.sessionId);
    const again = await quiet.kernel.exec('kvcoder.job.restart', { sessionId: quiet.sessionId, id: quiet.jobId });
    await quietEnd(quiet.kernel, quiet.sessionId, `(job ${again.id}) finished:`);
  });

  it('QA81-E3 the person\'s Stop of a default line starts no turn', async () => {
    const { kernel, sessionId, jobId } = await chatWith(line(30_000), ['started', 'never']);
    await running(kernel, sessionId);
    await kernel.exec('kvcoder.job.cancel', { sessionId, id: jobId });
    await quietEnd(kernel, sessionId, 'was stopped by the person.');
  });
});
