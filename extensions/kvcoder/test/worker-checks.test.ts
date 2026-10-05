import { describe, expect, it, vi } from 'vitest';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, runs, says, systemPrompt, toolResults } from './support/model-script.ts';
import { newSession, turnState } from './support/turns.ts';
import { wait } from './support/wait.ts';
import { programWorker, useWorkerPrograms } from './support/worker-programs.ts';
import { worker, workers } from './support/workers.ts';

const kvcoder = useKvcoder();
const programs = useWorkerPrograms();

const indexed = (prompt: string): string[] => prompt.split('\n').filter((line) => line.startsWith('- ')).map((line) => line.slice(2, line.indexOf(':')));
const check = (kernel: Awaited<ReturnType<typeof kvcoder.start>>['kernel'], name: string) => kernel.exec('kvcoder.delegate.worker.check', { name });

describe("a program worker's check (08 §8.5, ADR 0021, 17 and 37)", { timeout: 30_000 }, () => {
  it('QA32-H10 a program that is installed is checked at the first step, and its worker is named', async () => {
    programs.install('claude');
    const { kernel, fake } = await kvcoder.start({ settings: workers(worker('general'), programWorker('cc', 'claude')) });
    const sessionId = await newSession(kernel);
    fake.reply(says('hi'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    expect((await turnState(kernel, sessionId)).session.checks).toEqual([{ name: 'worker:cc', passed: true }]);
    expect(systemPrompt(fake, 0)).toContain('Workers: general (The general worker), cc (The cc worker).');
    expect(await check(kernel, 'cc')).toEqual({ status: 'ready' });
    expect(await check(kernel, 'general')).toEqual({ status: 'ready' });
  });

  it('QA32-E7 a missing program hides its worker, and with no other worker delegate is not a connector', async () => {
    programs.install();
    const { kernel, fake } = await kvcoder.start({ settings: workers(worker('general'), programWorker('pie', 'pi')) });
    const sessionId = await newSession(kernel);
    fake.reply(runs(command('delegate', 'run', { worker: 'pie', task: 'x' })), says('done'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await vi.waitFor(() => expect(fake.requests()).toHaveLength(2), wait);
    expect((await turnState(kernel, sessionId)).session.checks).toEqual([{ name: 'worker:pie', passed: false }]);
    expect(systemPrompt(fake, 0)).toContain('Workers: general (The general worker).');
    expect(toolResults(fake)).toEqual(['error kvcoder/WORKER_NOT_FOUND: There is no worker pie. The workers are: general.']);
    expect(await check(kernel, 'pie')).toEqual({ status: 'notFound' });

    await kernel.exec('kernel.settings.set', { key: 'kvcoder.delegate.workers', value: [programWorker('pie', 'pi')], scope: 'global' });
    const alone = await newSession(kernel);
    fake.reply(says('hi'));
    await kernel.exec('kvcoder.message.send', { sessionId: alone, text: 'go' });
    await vi.waitFor(() => expect(fake.requests()).toHaveLength(3), wait);
    expect(indexed(systemPrompt(fake, 2))).toEqual(['shell', 'fs', 'artifact', 'background', 'ask', 'todo']);
  });

  it('QA32-E8 an unknown name fails, and a worker that is turned off is still checked', async () => {
    programs.install('pi');
    const { kernel } = await kvcoder.start({ settings: workers(programWorker('pie', 'pi', { enabled: false })) });
    await expect(check(kernel, 'nobody')).rejects.toMatchObject({ problem: { code: 'kvcoder/WORKER_NOT_FOUND', params: { worker: 'nobody' } } });
    expect(await check(kernel, 'pie')).toEqual({ status: 'ready' });
  });

  it("QA32-E16 a subagent can't run a program worker: its session has no delegate", async () => {
    const installed = programs.install('pi');
    const { kernel, fake } = await kvcoder.start({ settings: workers(worker('general'), programWorker('pie', 'pi')) });
    const sessionId = await newSession(kernel);
    fake.reply(runs(command('delegate', 'run', { worker: 'general', task: 'Hand it on' })), runs(command('delegate', 'run', { worker: 'pie', task: 'say:hi' })), says('child done'), says('parent done'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await vi.waitFor(() => expect(fake.requests()).toHaveLength(4), wait);
    expect(indexed(systemPrompt(fake, 1))).not.toContain('delegate');
    expect(toolResults(fake, 2)).toEqual(["error VALIDATION_FAILED: delegate isn't available in this subagent."]);
    expect(installed.calls('pi')).toEqual([]);
  });
});
