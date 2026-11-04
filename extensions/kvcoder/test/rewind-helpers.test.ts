import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { TestKernel } from '@kvman/testkit';
import { heldReply } from './support/held-reply.ts';
import { delegated } from './support/helpers.ts';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, fsCall, runs, says, toolResults, type RunCallSpec } from './support/model-script.ts';
import { readAt, stored, turnOf, turnWhileRunning } from './support/rewind.ts';
import { newSession } from './support/turns.ts';
import { wait } from './support/wait.ts';
import { programWorker, useWorkerPrograms } from './support/worker-programs.ts';
import { worker, workers } from './support/workers.ts';

const kvcoder = useKvcoder();
const programs = useWorkerPrograms();

// What started after the message (plan 08 §8.1, ADR 0118, 1): helpers stop and go, program workers' runs stop telling
// no one, processes keep running but quiet; a helper started before it keeps running.

const startedIds = (results: readonly string[]): string[] => results.flatMap((text) => /^started (\S+)/.exec(text)?.[1] ?? []);
const backgroundTexts = async (kernel: TestKernel, sessionId: string) => (await stored(kernel, sessionId)).filter((message) => message.source?.kind === 'job' || message.source?.kind === 'subagent');
const untilGate = (gate: string): RunCallSpec => ({ connector: 'shell', command: 'exec', payload: { line: `node -e "const fs=require('fs');setInterval(()=>{if(fs.existsSync('${gate}'))process.exit(0)},50)"`, risky: false, background: true } });

describe('what started after the message (ADR 0118)', { timeout: 60_000 }, () => {
  it('QA77-H9 a helper started after the message is stopped, its file goes, and its records are deleted', async () => {
    const world = await kvcoder.start({ settings: workers(worker('helper')) });
    const { kernel } = world;
    const sessionId = await newSession(kernel);
    const run = command('delegate', 'run', { worker: 'helper', title: 'Helper', kind: 'change', files: ['helper.ts'], goal: 'Write it', done: 'It is done.' });
    await delegated(world, sessionId, [runs(run), says('Started.'), says('done')], [runs(fsCall('write', { path: 'helper.ts', content: 'from the helper\n' })), says('written')]);
    expect(readAt(kernel, 'helper.ts')).toBe('from the helper\n');
    const result = await kernel.exec('kvcoder.message.undo', { sessionId, files: true });
    expect(result.deleted).toEqual(['helper.ts']);
    expect(readAt(kernel, 'helper.ts')).toBeUndefined();
    expect(await kernel.exec('kvcoder.job.list', { sessionId })).toEqual([]);
  });

  it('QA77-H10 a helper started before the message keeps running, its later change goes back, and its result still arrives', async () => {
    const world = await kvcoder.start({ settings: workers(worker('helper')) });
    const { kernel, fake, helperFake } = world;
    const sessionId = await newSession(kernel);
    const writes = heldReply({ toolCall: { id: 'helper-write', name: 'run', arguments: { connector: 'fs', command: 'write', payload: { path: 'b.txt', content: 'b\n', risky: false } } } });
    const ends = heldReply({ text: 'finished' });
    helperFake.reply(writes.reply, ends.reply);
    await turnWhileRunning(kernel, fake, sessionId, 'start', runs(command('delegate', 'run', { worker: 'helper', title: 'Helper', kind: 'change', files: ['b.txt'], goal: 'Write it', done: 'It is done.' })), says('Started.'));
    await turnWhileRunning(kernel, fake, sessionId, 'meanwhile', says('ok'));
    writes.release();
    await vi.waitFor(() => expect(readAt(kernel, 'b.txt')).toBe('b\n'), wait);
    expect((await kernel.exec('kvcoder.message.undo', { sessionId, files: true })).deleted).toEqual(['b.txt']);
    const [helper] = await kernel.exec('kvcoder.job.list', { sessionId });
    expect(helper?.status).toBe('running');
    fake.reply(says('Seen.'));
    ends.release();
    await vi.waitFor(async () => expect((await backgroundTexts(kernel, sessionId)).length).toBe(1), wait);
  });

  it('QA77-H14 a process started after the message keeps running, and its end is never told', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    await turnWhileRunning(kernel, fake, sessionId, 'serve', runs(untilGate('gate-one'), untilGate('gate-two')), says('Serving.'));
    const [first = '', second = ''] = startedIds(toolResults(fake));
    await kernel.exec('kvcoder.message.undo', { sessionId, files: true });
    expect((await kernel.exec('kvcoder.job.list', { sessionId })).map((job) => job.status)).toEqual(['running', 'running']);
    writeFileSync(path.join(kernel.homeFolder, 'gate-one'), '');
    await vi.waitFor(async () => expect((await kernel.exec('kvcoder.job.list', { sessionId })).find((job) => job.id === first)?.status).not.toBe('running'), wait);
    await kernel.exec('kvcoder.job.cancel', { sessionId, id: second });
    await turnWhileRunning(kernel, fake, sessionId, 'anything?', says('ok'));
    expect(await backgroundTexts(kernel, sessionId)).toEqual([]);
  });

  it("QA77-H15 a program worker's run started after the message is stopped and forgotten, telling no one", async () => {
    const pi = programs.install('pi');
    const { kernel, fake } = await kvcoder.start({ settings: workers(programWorker('runner', 'pi')) });
    const sessionId = await newSession(kernel);
    await turnWhileRunning(kernel, fake, sessionId, 'run it', runs(command('delegate', 'run', { worker: 'runner', title: 'Runner', kind: 'find', goal: `wait:${pi.gate}`, done: 'It is done.' })), says('ok'));
    expect((await kernel.exec('kvcoder.job.list', { sessionId })).map((job) => job.kind)).toEqual(['worker']);
    await kernel.exec('kvcoder.message.undo', { sessionId, files: true });
    expect(await kernel.exec('kvcoder.job.list', { sessionId })).toEqual([]);
    writeFileSync(pi.gate, '');
    await turnOf(kernel, fake, sessionId, 'anything?', says('ok'));
    expect(await backgroundTexts(kernel, sessionId)).toEqual([]);
  });
});
