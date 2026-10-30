import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { TestKernel } from '@kvman/testkit';
import { git, initRepository, stage, staged } from './support/git-folder.ts';
import { useKvcoder, type World } from './support/kvcoder-kernel.ts';
import { command, runs, says } from './support/model-script.ts';
import { newSession } from './support/turns.ts';
import { wait } from './support/wait.ts';
import { programWorker, useWorkerPrograms } from './support/worker-programs.ts';
import { workers } from './support/workers.ts';

const kvcoder = useKvcoder();
const programs = useWorkerPrograms();
const settings = workers(programWorker('pie', 'pi'));

const stagingLine = 'kvman: this run changed what is staged in Git (1 paths differ from before it ran).';

// One turn that delegates `task` to the program worker, in the background (ADR 0108, 1); waits for the run's message,
// and gives the chat, the run's row, and the answer the message carries.
async function delegated(kernel: TestKernel, fake: World['fake'], task: string) {
  const sessionId = await newSession(kernel);
  fake.reply(runs(command('delegate', 'run', { worker: 'pie', title: 'Helper', kind: 'find', goal: task, done: 'It is done.' })), says('Started.'), says('read it'));
  await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
  const result = await vi.waitFor(async () => {
    const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 });
    const content = messages.find((message) => message.source?.kind === 'job')?.content['content'];
    expect(content).toBeTypeOf('string');
    return String(content).replace(/^[^\n]*finished:\n/, '');
  }, wait);
  const [row] = await kernel.exec('kvcoder.job.list', { sessionId });
  return { sessionId, row, result };
}

const restore = (kernel: TestKernel, sessionId: string, runId: string) => kernel.exec('kvcoder.delegate.staging.restore', { sessionId, runId });

describe('the Git staging guard around a program worker (08 §8.5, ADR 0060, 4)', { timeout: 30_000 }, () => {
  it('M2.4-E194 and E195 a program that stages a file is reported with one path, and restore puts back what was staged, once', async () => {
    programs.install('pi');
    const { kernel, fake } = await kvcoder.start({ settings });
    const folder = kernel.homeFolder;
    initRepository(folder);
    stage(folder, 'mine.txt');
    const { sessionId, row, result } = await delegated(kernel, fake, 'stage:theirs.txt');
    expect(result).toBe(`staged\n\n${stagingLine}`);
    expect(row).toMatchObject({ kind: 'worker', staging: { state: 'changed', paths: 1, headMoved: false } });
    expect(staged(folder)).toEqual(['mine.txt', 'theirs.txt']);

    await restore(kernel, sessionId, row?.id ?? '');
    expect(staged(folder)).toEqual(['mine.txt']);
    expect(existsSync(path.join(folder, 'theirs.txt'))).toBe(true);
    expect((await kernel.exec('kvcoder.job.get', { sessionId, id: row?.id ?? '' })).staging).toEqual({ state: 'restored', paths: 1, headMoved: false });
    await expect(restore(kernel, sessionId, row?.id ?? '')).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
  });

  it('M2.4-E196 restore refuses once the person has staged something else, and leaves their index', async () => {
    programs.install('pi');
    const { kernel, fake } = await kvcoder.start({ settings });
    const folder = kernel.homeFolder;
    initRepository(folder);
    const { sessionId, row } = await delegated(kernel, fake, 'stage:theirs.txt');
    stage(folder, 'later.txt');
    await expect(restore(kernel, sessionId, row?.id ?? '')).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
    expect(staged(folder)).toEqual(['later.txt', 'theirs.txt']);
  });

  it('M2.4-E197 a program that commits is reported with both lines and cannot be restored', async () => {
    programs.install('pi');
    const { kernel, fake } = await kvcoder.start({ settings });
    const folder = kernel.homeFolder;
    initRepository(folder);
    const before = git(folder, 'rev-parse', 'HEAD');
    const { sessionId, row, result } = await delegated(kernel, fake, 'commit:theirs.txt');
    const after = git(folder, 'rev-parse', 'HEAD');
    expect(result).toBe(`committed\n\n${stagingLine}\nkvman: this run moved HEAD from ${before.slice(0, 12)} to ${after.slice(0, 12)}.`);
    expect(row?.staging).toEqual({ state: 'changed', paths: 1, headMoved: true });
    await expect(restore(kernel, sessionId, row?.id ?? '')).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
    expect(git(folder, 'rev-parse', 'HEAD')).toBe(after);
  });

  it('M2.4-E198 a program that stages nothing, and a folder outside Git, keep no staging and add no line', async () => {
    programs.install('pi');
    const { kernel, fake } = await kvcoder.start({ settings });
    const outside = await delegated(kernel, fake, 'say:hello');
    expect(outside.result).toBe('hello');
    expect(outside.row).not.toHaveProperty('staging');
    initRepository(kernel.homeFolder);
    const quiet = await delegated(kernel, fake, 'say:again');
    expect(quiet.result).toBe('again');
    expect(quiet.row).not.toHaveProperty('staging');
    await expect(restore(kernel, quiet.sessionId, quiet.row?.id ?? '')).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
  });
});
