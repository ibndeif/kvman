import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { z } from '@kvman/sdk';
import type { TestKernel } from '@kvman/testkit';
import type { FakeOpenAI } from '@kvman/testkit/fake-openai';
import { useKvcoder, type StartOptions } from './support/kvcoder-kernel.ts';
import { command, runs, says, shell, toolResults, type RunCallSpec } from './support/model-script.ts';
import { newSession } from './support/turns.ts';
import { wait } from './support/wait.ts';

const kvcoder = useKvcoder();

// A background start reports what really happened (ADR 0012, 7 to 9). The lines are bash, the Linux and macOS branch.
function posixShell(): void {
  if (process.platform === 'win32') throw new Error('These calls are bash; Windows runs PowerShell.');
}

async function say(kernel: TestKernel, fake: FakeOpenAI, sessionId: string, ...commands: RunCallSpec[]): Promise<string[]> {
  fake.reply(runs(...commands), says('ok'));
  await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
  await kernel.clock.advance(0);
  return toolResults(fake).slice(-commands.length);
}

async function started(line: string, options: StartOptions = {}) {
  const world = await kvcoder.start(options);
  const sessionId = await newSession(world.kernel);
  const [result = ''] = await say(world.kernel, world.fake, sessionId, shell(line, { background: true }));
  return { ...world, sessionId, result, jobId: /^started (\S+)/.exec(result)?.[1] ?? '' };
}

const messageSchema = z.object({ kind: z.string(), source: z.object({ kind: z.string(), jobId: z.string().optional() }).nullish(), content: z.record(z.string(), z.unknown()) });

async function toolResult(kernel: TestKernel, sessionId: string): Promise<{ isError: boolean; details: Record<string, unknown> }> {
  const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 });
  const found = messages.map((message) => messageSchema.parse(message)).find((message) => message.kind === 'toolResult');
  if (found === undefined) throw new Error('No tool result reached the chat.');
  return { isError: found.content['isError'] === true, details: (found.content['details'] ?? {}) as Record<string, unknown> };
}

describe('a background start reports what really happened (08 §8.3, ADR 0012, 7 to 9)', { timeout: 60_000 }, () => {
  it('QA19-H10 a background start that still runs', async () => {
    posixShell();
    const { kernel, sessionId, result, jobId } = await started('echo up; sleep 30');
    expect(result).toBe(`started ${jobId}\nup\n[running]`);
    const { isError, details } = await toolResult(kernel, sessionId);
    expect(isError).toBe(false);
    expect(details['background']).toBe(true);
    expect(details['jobId']).toBe(jobId);
    expect(details).not.toHaveProperty('exitCode');
  });

  it('QA19-H11 a background start that failed at once', async () => {
    posixShell();
    const { kernel, sessionId, result, jobId } = await started('echo boom; exit 3');
    expect(result).toBe(`started ${jobId}\nboom\n[the process has already ended]\n[exit code 3]`);
    const { isError, details } = await toolResult(kernel, sessionId);
    expect(isError).toBe(true);
    expect(details['exitCode']).toBe(3);
    await vi.waitFor(async () => expect(await kernel.exec('kvcoder.job.get', { sessionId, id: jobId })).toMatchObject({ status: 'failed', exitCode: 3 }), wait);
    const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 });
    expect(messages.filter((message) => messageSchema.parse(message).source?.kind === 'job')).toEqual([]);
  });

  it('QA19-H12 a background start that ended well', async () => {
    posixShell();
    const { kernel, sessionId, result, jobId } = await started('echo done');
    expect(result).toBe(`started ${jobId}\ndone\n[the process has already ended]\n[exit code 0]`);
    const { isError, details } = await toolResult(kernel, sessionId);
    expect(isError).toBe(false);
    expect(details['exitCode']).toBe(0);
    await vi.waitFor(async () => expect(await kernel.exec('kvcoder.job.get', { sessionId, id: jobId })).toMatchObject({ status: 'succeeded', exitCode: 0 }), wait);
    const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 });
    expect(messages.filter((message) => messageSchema.parse(message).source?.kind === 'job')).toEqual([]);
  });

  it('QA19-E7 a background process killed at once', async () => {
    posixShell();
    const { kernel, sessionId, result, jobId } = await started('kill -9 $$');
    expect(result).toBe(`started ${jobId}\n[the process has already ended]\n[killed by SIGKILL]`);
    const { isError, details } = await toolResult(kernel, sessionId);
    expect(isError).toBe(true);
    expect(details).not.toHaveProperty('exitCode');
    await vi.waitFor(async () => expect(await kernel.exec('kvcoder.job.get', { sessionId, id: jobId })).toMatchObject({ status: 'failed' }), wait);
    const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 });
    expect(messages.filter((message) => messageSchema.parse(message).source?.kind === 'job')).toEqual([]);
  });

  it('QA19-E8 an exit after the startup second is still a message', async () => {
    posixShell();
    const { kernel, sessionId, result, jobId } = await started('echo up; until [ -f go ]; do sleep 0.1; done; exit 2');
    expect(result).toBe(`started ${jobId}\nup\n[running]`);
    writeFileSync(path.join(kernel.homeFolder, 'go'), 'go\n');
    await vi.waitFor(async () => expect(await kernel.exec('kvcoder.job.get', { sessionId, id: jobId })).toMatchObject({ status: 'failed', exitCode: 2 }), wait);
    await vi.waitFor(async () => {
      const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 });
      const found = messages.map((message) => messageSchema.parse(message)).find((message) => message.source?.kind === 'job');
      expect(found).toBeDefined();
      expect(String(found?.content['content'])).toContain('The process exited with code 2.');
      expect(String(found?.content['content'])).toContain('up');
    }, wait);
  });

  it('QA19-E13 a binary connector\u2019s exec in the background', async () => {
    posixShell();
    const node = { 'kvcoder.connectors': [{ name: 'node', description: 'Node.js.', binary: { check: 'node --version' } }] } as unknown as Record<string, string>;
    const world = await kvcoder.start({ settings: node });
    const sessionId = await newSession(world.kernel);
    const [result = ''] = await say(world.kernel, world.fake, sessionId, command('node', 'exec', { args: '-e "process.exit(4)"', background: true, risky: false }));
    const jobId = /^started (\S+)/.exec(result)?.[1] ?? '';
    expect(result).toBe(`started ${jobId}\n[the process has already ended]\n[exit code 4]`);
    const { isError, details } = await toolResult(world.kernel, sessionId);
    expect(isError).toBe(true);
    expect(details['exitCode']).toBe(4);
    await vi.waitFor(async () => expect(await world.kernel.exec('kvcoder.job.get', { sessionId, id: jobId })).toMatchObject({ status: 'failed', exitCode: 4 }), wait);
    const { messages } = await world.kernel.exec('kvcoder.message.list', { sessionId, limit: 100 });
    expect(messages.filter((message) => messageSchema.parse(message).source?.kind === 'job')).toEqual([]);
  });
});
