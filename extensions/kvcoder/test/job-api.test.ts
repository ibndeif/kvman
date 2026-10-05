import { describe, expect, it, vi } from 'vitest';
import { z } from '@kvman/sdk';
import type { TestKernel } from '@kvman/testkit';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, runs, says, shell } from './support/model-script.ts';
import { newSession } from './support/turns.ts';
import { wait } from './support/wait.ts';

const kvcoder = useKvcoder();

// The person's view of a chat's background jobs (08 §8.6, ADR 0009, 152). Bash, so Linux and macOS.
function posixShell(): void {
  if (process.platform === 'win32') throw new Error('These calls are bash; Windows runs PowerShell.');
}

const messagesSchema = z.object({ messages: z.array(z.object({ kind: z.string(), source: z.object({ kind: z.string() }).nullish(), content: z.record(z.string(), z.unknown()) })) });

async function startJob(command: string) {
  const world = await kvcoder.start();
  const sessionId = await newSession(world.kernel);
  world.fake.reply(runs(shell(command, { background: true })), says('ok'));
  await world.kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
  await world.kernel.clock.advance(0);
  const [job] = await world.kernel.exec('kvcoder.job.list', { sessionId });
  return { ...world, sessionId, jobId: job?.id ?? '' };
}

async function jobMessages(kernel: TestKernel, sessionId: string): Promise<string[]> {
  const { messages } = messagesSchema.parse(await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 }));
  return messages.filter((message) => message.kind === 'user' && message.source?.kind === 'job').map((message) => String(message.content['content']));
}

describe("a chat's background jobs for the person (08 §8.6, ADR 0009, 152)", { timeout: 60_000 }, () => {
  it('QA3-H16 the person lists, reads, and stops a process, and others may not', async () => {
    posixShell();
    const { kernel, sessionId, jobId } = await startJob('echo "Serving on http://localhost:8000."; sleep 30');
    const [row] = await kernel.exec('kvcoder.job.list', { sessionId });
    expect(row).toEqual({ id: jobId, kind: 'process', title: 'A test call.', call: 'echo "Serving on http://localhost:8000."; sleep 30', status: 'running', startedAt: expect.any(String) as unknown, links: ['http://localhost:8000'] });
    expect(await kernel.exec('kvcoder.job.get', { sessionId, id: jobId })).toMatchObject({ id: jobId, status: 'running', output: 'Serving on http://localhost:8000.' });
    for (const call of [kernel.exec('kvcoder.job.list', { sessionId }, { as: '@test/todo' }), kernel.exec('kvcoder.job.get', { sessionId, id: jobId }, { as: '@test/todo' }), kernel.exec('kvcoder.job.cancel', { sessionId, id: jobId }, { as: '@test/todo' })]) {
      await expect(call).rejects.toMatchObject({ problem: { code: 'NOT_PUBLIC' } });
    }
    await kernel.exec('kvcoder.job.cancel', { sessionId, id: jobId });
    expect(await kernel.exec('kvcoder.job.get', { sessionId, id: jobId })).toMatchObject({ status: 'cancelled' });
    const [text = '', ...rest] = await jobMessages(kernel, sessionId);
    expect(text).toContain(`(job ${jobId}) finished:\nThe process was stopped by the person.\nIts last output:\nServing on http://localhost:8000.`);
    expect(rest).toEqual([]);
    expect(await kernel.exec('kvcoder.turn.list', { sessionId, limit: 10 })).toHaveLength(1);
  });

  it("QA3-E18 another chat's job id isn't found by the person's calls, and the process keeps running", async () => {
    posixShell();
    const { kernel, jobId } = await startJob('sleep 30');
    const other = await newSession(kernel);
    for (const call of [kernel.exec('kvcoder.job.get', { sessionId: other, id: jobId }), kernel.exec('kvcoder.job.cancel', { sessionId: other, id: jobId })]) {
      await expect(call).rejects.toMatchObject({ problem: { code: 'kvcoder/JOB_NOT_FOUND' } });
    }
    expect(z.array(z.object({ name: z.string() })).parse(await kernel.exec('kernel.processes.list', {})).map((row) => row.name)).toContain(`job-${jobId}`);
  });

  it('QA3-E20 a process stopped by the agent or the person is reported once and reads cancelled', async () => {
    posixShell();
    const { kernel, fake, sessionId, jobId } = await startJob('sleep 30');
    fake.reply(runs(command('background', 'stop', { id: jobId })), says('ok'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'stop it' });
    await kernel.clock.advance(0);
    expect(await kernel.exec('kvcoder.job.get', { sessionId, id: jobId })).toMatchObject({ status: 'cancelled' });
    expect(await jobMessages(kernel, sessionId)).toEqual([]);
    await kernel.exec('kvcoder.job.cancel', { sessionId, id: jobId });
    expect(await jobMessages(kernel, sessionId)).toEqual([]);
  });

  it('QA3-E22 the list shows running jobs first and keeps ended ones', async () => {
    posixShell();
    const { kernel, fake, sessionId, jobId } = await startJob('echo quick');
    await vi.waitFor(async () => expect(await kernel.exec('kvcoder.job.get', { sessionId, id: jobId })).toMatchObject({ status: 'succeeded', output: 'quick' }), wait);
    fake.reply(runs(shell('sleep 30', { background: true })), says('ok'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'one more' });
    await kernel.clock.advance(0);
    const rows = await kernel.exec('kvcoder.job.list', { sessionId });
    expect(rows.map((row) => row.status)).toEqual(['running', 'succeeded']);
    expect(rows[1]).toMatchObject({ id: jobId, exitCode: 0 });
  });
});
