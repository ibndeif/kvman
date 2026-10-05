import { describe, expect, it, vi } from 'vitest';
import { z } from '@kvman/sdk';
import type { TestKernel } from '@kvman/testkit';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { runs, says, shell } from './support/model-script.ts';
import { newSession } from './support/turns.ts';
import { wait } from './support/wait.ts';

const kvcoder = useKvcoder();

// How kvcoder learns of a background process's end without its own doing (08 §8.3, ADR 0009, 150). Bash, so Linux and macOS.
function posixShell(): void {
  if (process.platform === 'win32') throw new Error('These calls are bash; Windows runs PowerShell.');
}

const messageSchema = z.object({ kind: z.string(), source: z.object({ kind: z.string(), jobId: z.string().optional() }).nullish(), content: z.record(z.string(), z.unknown()) });
const jobSchema = z.object({ status: z.string(), exitCode: z.number().optional() });

async function jobMessages(kernel: TestKernel, sessionId: string): Promise<string[]> {
  const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 });
  return messages.map((message) => messageSchema.parse(message)).filter((message) => message.kind === 'user' && message.source?.kind === 'job').map((message) => String(message.content['content']));
}

async function startJob(command: string) {
  const world = await kvcoder.start();
  const sessionId = await newSession(world.kernel);
  world.fake.reply(runs(shell(command, { background: true })), says('ok'));
  await world.kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
  await world.kernel.clock.advance(0);
  const [turn] = await world.kernel.exec('kvcoder.turn.list', { sessionId, limit: 1 });
  const [job] = await world.kernel.exec('kvcoder.job.list', { sessionId });
  return { ...world, sessionId, jobId: job?.id ?? '', turnId: turn?.id ?? '' };
}

const statusOf = async (kernel: TestKernel, sessionId: string, id: string) => jobSchema.parse(await kernel.exec('kvcoder.job.get', { sessionId, id }));

describe('background processes end without kvcoder doing it (08 §8.3, ADR 0009, 150)', { timeout: 60_000 }, () => {
  it('QA3-H15 an exit by itself adds a background message with the code and last lines, and starts no turn', async () => {
    posixShell();
    const { kernel, sessionId, jobId } = await startJob('echo one; echo two; exit 1');
    await vi.waitFor(async () => expect(await jobMessages(kernel, sessionId)).toHaveLength(1), wait);
    const [text = ''] = await jobMessages(kernel, sessionId);
    expect(text).toContain(`(job ${jobId}) finished:\nThe process exited with code 1.\nIts last output:\none\ntwo`);
    expect(await statusOf(kernel, sessionId, jobId)).toEqual({ status: 'failed', exitCode: 1 });
    expect(await kernel.exec('kvcoder.turn.list', { sessionId, limit: 10 })).toHaveLength(1);
    expect((await kernel.exec('kvcoder.session.get', { sessionId })).status).toBe('idle');
  });

  it("QA3-E17 another extension's process with the same name changes nothing", async () => {
    posixShell();
    const { kernel, sessionId, jobId } = await startJob('sleep 30');
    await kernel.exec('todo.process.start', { name: `job-${jobId}` });
    const rows = z.array(z.object({ name: z.string() }));
    await vi.waitFor(async () => expect(rows.parse(await kernel.exec('kernel.processes.list', {})).filter((row) => row.name === `job-${jobId}`)).toHaveLength(1), wait);
    await kernel.clock.advance(0);
    expect(await statusOf(kernel, sessionId, jobId)).toEqual({ status: 'running' });
    expect(await jobMessages(kernel, sessionId)).toEqual([]);
  });

  it('QA3-H20 kvman stopping interrupts what runs, and the chat hears of it at its next message, once', async () => {
    posixShell();
    const { kernel, fake, sessionId, jobId } = await startJob('echo serving; sleep 30');
    await kernel.restart();
    expect(await statusOf(kernel, sessionId, jobId)).toEqual({ status: 'interrupted' });
    expect(await jobMessages(kernel, sessionId)).toEqual([]);
    fake.reply(says('ok'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'are you there' });
    await kernel.clock.advance(0);
    const [text = '', ...rest] = await jobMessages(kernel, sessionId);
    expect(text).toContain(`(job ${jobId}) finished:\nThe process was interrupted because kvman stopped.\nIts last output:\nserving`);
    expect(rest).toEqual([]);
    fake.reply(says('ok'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'and now' });
    await kernel.clock.advance(0);
    expect(await jobMessages(kernel, sessionId)).toHaveLength(1);
  });

  it("QA3-E19 an exit already recorded isn't overwritten when kvman restarts", async () => {
    posixShell();
    const { kernel, sessionId, jobId } = await startJob('echo done; exit 2');
    await vi.waitFor(async () => expect(await statusOf(kernel, sessionId, jobId)).toEqual({ status: 'failed', exitCode: 2 }), wait);
    await kernel.restart();
    expect(await statusOf(kernel, sessionId, jobId)).toEqual({ status: 'failed', exitCode: 2 });
    expect(await jobMessages(kernel, sessionId)).toHaveLength(1);
  });
});
