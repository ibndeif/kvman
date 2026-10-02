import { describe, expect, it, vi } from 'vitest';
import { z } from '@kvman/sdk';
import type { TestKernel } from '@kvman/testkit';
import type { FakeOpenAI } from '@kvman/testkit/fake-openai';
import { useKvcoder, type StartOptions } from './support/kvcoder-kernel.ts';
import { calls, says, toolResults, type ShellCallSpec } from './support/model-script.ts';
import { newSession } from './support/turns.ts';
import { wait } from './support/wait.ts';

const kvcoder = useKvcoder();

// The bash tool's async mode (08 §8.3, ADR 0009, 149 to 151). The commands are bash, the Linux and macOS branch.
function posixShell(): void {
  if (process.platform === 'win32') throw new Error('These calls are bash; Windows runs PowerShell.');
}

const processRowsSchema = z.array(z.object({ name: z.string() }));
const jobSchema = z.object({ id: z.string(), kind: z.string(), call: z.string(), status: z.string(), exitCode: z.number().optional(), output: z.string().optional() });

async function say(kernel: TestKernel, fake: FakeOpenAI, sessionId: string, ...commands: ShellCallSpec[]): Promise<string[]> {
  fake.reply(calls(...commands), says('ok'));
  await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
  await kernel.clock.advance(0);
  return toolResults(fake).slice(-commands.length);
}

async function started(command: string, options: StartOptions = {}) {
  const world = await kvcoder.start(options);
  const sessionId = await newSession(world.kernel);
  const [result = ''] = await say(world.kernel, world.fake, sessionId, { command, mode: 'async' });
  return { ...world, sessionId, result, jobId: /^started (\S+)/.exec(result)?.[1] ?? '' };
}

const running = async (kernel: TestKernel, jobId: string): Promise<boolean> => processRowsSchema.parse(await kernel.exec('kernel.processes.list', {})).some((row) => row.name === `job-${jobId}`);

describe('async shell calls (08 §8.3, ADR 0009, 149 to 151)', { timeout: 60_000 }, () => {
  it('QA3-H12 an async call starts a background process and returns its id and first output', async () => {
    posixShell();
    const { kernel, fake, sessionId, result, jobId } = await started('echo up; sleep 30');
    expect(result).toBe(`started ${jobId}\nup\n[exit code 0]`);
    expect(await running(kernel, jobId)).toBe(true);
    const [list = ''] = await say(kernel, fake, sessionId, 'jobs list');
    expect(z.array(jobSchema).parse(JSON.parse(list.replace(/\n\[exit code 0\]$/, '')))).toEqual([expect.objectContaining({ id: jobId, kind: 'process', call: 'echo up; sleep 30', status: 'running' })]);
  });

  it('QA3-H13 jobs get shows a running process with its output, then its exit', async () => {
    posixShell();
    const { kernel, fake, sessionId, jobId } = await started('echo first; sleep 2; echo last; exit 3');
    const [running = ''] = await say(kernel, fake, sessionId, `jobs get ${jobId}`);
    expect(jobSchema.parse(JSON.parse(running.replace(/\n\[exit code 0\]$/, '')))).toMatchObject({ status: 'running', output: 'first' });
    await vi.waitFor(async () => expect(await kernel.exec('kvcoder.job.get', { sessionId, id: jobId })).toMatchObject({ status: 'failed', exitCode: 3 }), wait);
    const [ended = ''] = await say(kernel, fake, sessionId, `jobs get ${jobId}`);
    expect(jobSchema.parse(JSON.parse(ended.replace(/\n\[exit code 0\]$/, '')))).toMatchObject({ status: 'failed', exitCode: 3, output: 'first\nlast' });
    const ok = await started('echo done');
    await vi.waitFor(async () => expect(await ok.kernel.exec('kvcoder.job.get', { sessionId: ok.sessionId, id: ok.jobId })).toMatchObject({ status: 'succeeded', exitCode: 0 }), wait);
    const [done = ''] = await say(ok.kernel, ok.fake, ok.sessionId, `jobs get ${ok.jobId}`);
    expect(jobSchema.parse(JSON.parse(done.replace(/\n\[exit code 0\]$/, '')))).toMatchObject({ status: 'succeeded', exitCode: 0 });
  });

  it('QA3-H14 the agent stops its process with jobs cancel, once', async () => {
    posixShell();
    const { kernel, fake, sessionId, jobId } = await started('sleep 30');
    const [cancel = '', again = '', get = ''] = [...(await say(kernel, fake, sessionId, `jobs cancel ${jobId}`)), ...(await say(kernel, fake, sessionId, `jobs cancel ${jobId}`)), ...(await say(kernel, fake, sessionId, `jobs get ${jobId}`))];
    expect(cancel).toBe('{\n  "cancelled": true\n}\n[exit code 0]');
    expect(again).toBe('{\n  "cancelled": false\n}\n[exit code 0]');
    expect(jobSchema.parse(JSON.parse(get.replace(/\n\[exit code 0\]$/, ''))).status).toBe('cancelled');
    expect(await running(kernel, jobId)).toBe(false);
  });

  it("QA3-H17 deleting a chat stops its processes, and a turn's Stop button leaves them running", async () => {
    posixShell();
    const { kernel, fake, sessionId, jobId } = await started('sleep 30');
    fake.reply(calls('sleep 30'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'wait here' });
    await vi.waitFor(async () => expect((await kernel.exec('kvcoder.session.get', { sessionId })).status).toBe('running'), wait);
    await kernel.exec('kvcoder.turn.cancel', { sessionId });
    await kernel.clock.advance(0);
    expect(await running(kernel, jobId)).toBe(true);
    await kernel.exec('kvcoder.session.delete', { sessionId });
    expect(await running(kernel, jobId)).toBe(false);
  });

  it('QA3-E15 an async call ignores timeoutMs', async () => {
    posixShell();
    const world = await kvcoder.start();
    const sessionId = await newSession(world.kernel);
    const [result = ''] = await say(world.kernel, world.fake, sessionId, { command: 'sleep 30', mode: 'async', timeoutMs: 100 });
    const jobId = /^started (\S+)/.exec(result)?.[1] ?? '';
    expect(result).toBe(`started ${jobId}\n[exit code 0]`);
    expect(await running(world.kernel, jobId)).toBe(true);
  });

  it('QA3-E16 a command that ends at once says so, and a shell that cannot start gives an error and no job', async () => {
    posixShell();
    const { result, jobId } = await started('echo hi');
    expect(result).toBe(`started ${jobId}\nhi\n[the process has already ended; jobs get ${jobId} has its output]\n[exit code 0]`);
    const broken = await started('echo hi', { settings: { 'kvcoder.shell.path': '/definitely/not/bash' } });
    expect(broken.result).toMatch(/^error VALIDATION_FAILED: .*\n\[exit code 1\]$/);
    expect(await broken.kernel.exec('kvcoder.job.list', { sessionId: broken.sessionId })).toEqual([]);
  });

  it("QA3-E18 another chat's process isn't found by jobs get or jobs cancel, and keeps running", async () => {
    posixShell();
    const { kernel, fake, jobId } = await started('sleep 30');
    const other = await newSession(kernel);
    const [get = '', cancel = ''] = [...(await say(kernel, fake, other, `jobs get ${jobId}`)), ...(await say(kernel, fake, other, `jobs cancel ${jobId}`))];
    expect(get).toBe(`error kvcoder/JOB_NOT_FOUND: This chat started no background job ${jobId}.\n[exit code 1]`);
    expect(cancel).toBe(get);
    expect(await running(kernel, jobId)).toBe(true);
  });
});
