import { describe, expect, it, vi } from 'vitest';
import { z } from '@kvman/sdk';
import type { TestKernel } from '@kvman/testkit';
import type { FakeOpenAI } from '@kvman/testkit/fake-openai';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, runs, says, shell, toolResults, type RunCallSpec } from './support/model-script.ts';
import { newSession, turnState } from './support/turns.ts';
import { wait } from './support/wait.ts';

const kvcoder = useKvcoder();

// The lines here are bash, the Linux and macOS branch.
function posixShell(): void {
  if (process.platform === 'win32') throw new Error('These lines are bash; Windows runs PowerShell.');
}

const rowSchema = z.object({ id: z.string(), kind: z.string(), call: z.string(), status: z.string(), output: z.string().optional() });

async function say(kernel: TestKernel, fake: FakeOpenAI, sessionId: string, ...calls: RunCallSpec[]): Promise<string[]> {
  fake.reply(runs(...calls), says('ok'));
  await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
  await kernel.clock.advance(0);
  return toolResults(fake).slice(-calls.length);
}

describe('the background connector (08 §8.5, ADR 0011, 6)', { timeout: 60_000 }, () => {
  it('QA18-H9 a background shell line is listed, read, and stopped once, by the id its call returned', async () => {
    posixShell();
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    const [started = ''] = await say(kernel, fake, sessionId, shell('echo up; sleep 30', { background: true }));
    const id = /^started (\S+)\nup\n\[running\]$/.exec(started)?.[1] ?? '';
    expect(id).not.toBe('');
    const [list = ''] = await say(kernel, fake, sessionId, command('background', 'list'));
    expect(z.array(rowSchema).parse(JSON.parse(list))).toEqual([expect.objectContaining({ id, kind: 'process', call: 'echo up; sleep 30', status: 'running' })]);
    const [output = ''] = await say(kernel, fake, sessionId, command('background', 'output', { id }));
    expect(rowSchema.parse(JSON.parse(output))).toMatchObject({ id, status: 'running', output: 'up' });
    const [stop = '', again = ''] = [...(await say(kernel, fake, sessionId, command('background', 'stop', { id }))), ...(await say(kernel, fake, sessionId, command('background', 'stop', { id })))];
    expect(stop).toBe('{"stopped":true}');
    expect(again).toBe('{"stopped":false}');
    const processes = z.array(z.object({ name: z.string() })).parse(await kernel.exec('kernel.processes.list', {}));
    expect(processes.map((row) => row.name)).not.toContain(`job-${id}`);
  });

  it('QA18-H10 and QA31-E13 a background run of a worker returns its id, is listed as a subagent, and answers later as a message', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    let release = (): void => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    fake.reply(runs({ ...command('delegate', 'run', { worker: 'general', title: 'Helper', task: 'Look around', background: true }), description: 'Asking a helper to look around.' }), { chunks: [{ wait: held }, { text: 'found it' }] }, says('parent went on'), says('after the answer'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await vi.waitFor(async () => expect((await turnState(kernel, sessionId)).turn).toMatchObject({ outcome: 'done' }), wait);
    const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 });
    const started = JSON.stringify(messages.find((message) => message.kind === 'toolResult')?.content['content']);
    const childId = /started ([0-9a-f-]{36})/.exec(started)?.[1] ?? '';
    expect((await kernel.exec('kvcoder.session.get', { sessionId: childId })).parentId).toBe(sessionId);
    expect(await kernel.exec('kvcoder.job.list', { sessionId })).toEqual([expect.objectContaining({ id: childId, kind: 'subagent', call: 'Asking a helper to look around.', status: 'running' }) as unknown]);
    release();
    await vi.waitFor(async () => {
      const after = await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 });
      expect(after.messages.find((message) => message.source?.kind === 'subagent')?.source).toEqual({ kind: 'subagent', sessionId: childId });
    }, wait);
  });

  it("QA18-E15 another chat's background run isn't found by output or stop, and keeps running", async () => {
    posixShell();
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    const [started = ''] = await say(kernel, fake, sessionId, shell('sleep 30', { background: true }));
    const id = /^started (\S+)/.exec(started)?.[1] ?? '';
    const other = await newSession(kernel);
    const [output = '', stop = ''] = [...(await say(kernel, fake, other, command('background', 'output', { id }))), ...(await say(kernel, fake, other, command('background', 'stop', { id })))];
    expect(output).toMatch(/^error kvcoder\/JOB_NOT_FOUND: /);
    expect(stop).toBe(output);
    expect(await kernel.exec('kvcoder.job.get', { sessionId, id })).toMatchObject({ status: 'running' });
  });
});
