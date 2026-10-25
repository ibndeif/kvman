import { describe, expect, it, vi } from 'vitest';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, runs, says, shell } from './support/model-script.ts';
import { newSession } from './support/turns.ts';
import { wait } from './support/wait.ts';
import { worker, workers } from './support/workers.ts';

const kvcoder = useKvcoder();

// Run again and Restart for the person (08 §8.6 and §8.7, ADR 0102, 7). Bash, so Linux and macOS.
function posixShell(): void {
  if (process.platform === 'win32') throw new Error('These calls are bash; Windows runs PowerShell.');
}

async function chatWith(line: string) {
  const world = await kvcoder.start({ settings: workers(worker('helper')) });
  const sessionId = await newSession(world.kernel);
  world.fake.reply(runs(shell(line, { background: true })), says('ok'));
  await world.kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
  await world.kernel.clock.advance(0);
  const [job] = await world.kernel.exec('kvcoder.job.list', { sessionId });
  return { ...world, sessionId, jobId: job?.id ?? '' };
}

const jobMessages = async (world: Awaited<ReturnType<typeof chatWith>>) => (await world.kernel.exec('kvcoder.message.list', { sessionId: world.sessionId, limit: 100 })).messages.filter((message) => message.kind === 'user' && message.source?.kind === 'job');

describe('a background process started again by the person (ADR 0102, 7)', { timeout: 60_000 }, () => {
  it('QA67-H13 Restart stops the running process without a message and starts its line as a new one', async () => {
    posixShell();
    const world = await chatWith('echo serving; sleep 30');
    const requests = world.fake.requests().length;
    const { id } = await world.kernel.exec('kvcoder.job.restart', { sessionId: world.sessionId, id: world.jobId });
    expect(id).not.toBe(world.jobId);
    const rows = await world.kernel.exec('kvcoder.job.list', { sessionId: world.sessionId });
    expect(rows.find((row) => row.id === id)).toMatchObject({ kind: 'process', call: 'echo serving; sleep 30', status: 'running' });
    expect(rows.find((row) => row.id === world.jobId)?.status).not.toBe('running');
    expect(await jobMessages(world)).toEqual([]);
    expect(world.fake.requests()).toHaveLength(requests);
    await world.kernel.exec('kvcoder.job.cancel', { sessionId: world.sessionId, id });
  });

  it('QA67-H14 Run again starts an ended process\'s line, and no turn starts', async () => {
    posixShell();
    const world = await chatWith('echo once');
    await vi.waitFor(async () => expect((await world.kernel.exec('kvcoder.job.list', { sessionId: world.sessionId }))[0]?.status).toBe('succeeded'), wait);
    const requests = world.fake.requests().length;
    const { id } = await world.kernel.exec('kvcoder.job.restart', { sessionId: world.sessionId, id: world.jobId });
    const rows = await world.kernel.exec('kvcoder.job.list', { sessionId: world.sessionId });
    expect(rows.map((row) => row.id).sort()).toEqual([id, world.jobId].sort());
    expect((await world.kernel.exec('kvcoder.session.get', { sessionId: world.sessionId })).status).toBe('idle');
    expect(world.fake.requests()).toHaveLength(requests);
  });

  it('QA67-E17 a helper, an unknown id, and an extension are refused', async () => {
    posixShell();
    const world = await chatWith('echo once');
    world.fake.reply(runs(command('delegate', 'run', { worker: 'helper', title: 'Helper', task: 'Look', background: true })), says('looked'), says('ok'), says('noted'));
    await world.kernel.exec('kvcoder.message.send', { sessionId: world.sessionId, text: 'more' });
    await world.kernel.clock.advance(0);
    const helper = await vi.waitFor(async () => {
      const found = (await world.kernel.exec('kvcoder.job.list', { sessionId: world.sessionId })).find((row) => row.kind === 'subagent');
      expect(found).toBeDefined();
      return found?.id ?? '';
    }, wait);
    await expect(world.kernel.exec('kvcoder.job.restart', { sessionId: world.sessionId, id: helper })).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
    await expect(world.kernel.exec('kvcoder.job.restart', { sessionId: world.sessionId, id: 'nope' })).rejects.toMatchObject({ problem: { code: 'kvcoder/JOB_NOT_FOUND' } });
    await expect(world.kernel.exec('kvcoder.job.restart', { sessionId: world.sessionId, id: world.jobId }, { as: '@test/todo' })).rejects.toMatchObject({ problem: { code: 'NOT_PUBLIC' } });
  });
});
