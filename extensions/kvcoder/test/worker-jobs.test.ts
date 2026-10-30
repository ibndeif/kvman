import { describe, expect, it, vi } from 'vitest';
import { alive } from './support/alive.ts';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, runs, says, toolResults } from './support/model-script.ts';
import { newSession, turnState } from './support/turns.ts';
import { wait } from './support/wait.ts';
import { programWorker, useWorkerPrograms, type Programs } from './support/worker-programs.ts';
import { workers } from './support/workers.ts';

const kvcoder = useKvcoder();
const programs = useWorkerPrograms();

type World = Awaited<ReturnType<typeof kvcoder.start>>;
const delegate = (goal: string) => command('delegate', 'run', { worker: 'pie', title: 'Helper', kind: 'find', goal, done: 'It is done.' });
const requests = (fake: { requests(): readonly unknown[] }, count: number) => vi.waitFor(() => expect(fake.requests()).toHaveLength(count), wait);
const gone = (pid: number) => vi.waitFor(() => expect(alive(pid)).toBe(false), wait);

async function notices(kernel: World['kernel'], sessionId: string): Promise<unknown[]> {
  const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 });
  return messages.filter((message) => message.kind === 'notice').map((message) => message.content);
}

// A chat whose `pi` worker is running in the background and waits for the gate, with the turn that started it ended.
async function running(): Promise<World & { installed: Programs; sessionId: string; pid: number }> {
  const installed = programs.install('pi');
  const world = await kvcoder.start({ settings: workers(programWorker('pie', 'pi')) });
  const sessionId = await newSession(world.kernel);
  world.fake.reply(runs(delegate(`wait:${installed.gate}`)), says('went on'));
  await world.kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
  await vi.waitFor(() => expect(installed.pid('pi')).toBeTypeOf('number'), wait);
  await vi.waitFor(async () => expect((await turnState(world.kernel, sessionId)).turn).toMatchObject({ outcome: 'done' }), wait);
  return { ...world, installed, sessionId, pid: Number(installed.pid('pi')) };
}

const told = async (kernel: World['kernel'], sessionId: string, text: string) => vi.waitFor(async () => {
  const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 });
  expect(messages.filter((message) => message.source?.kind === 'job' && JSON.stringify(message.content).includes(text))).toHaveLength(1);
}, wait);

describe("a program worker's run as a job of its chat (08 §8.5 and §8.6, ADR 0021, 15 and 33 to 35)", { timeout: 30_000 }, () => {
  it('QA32-H8 the run is a row for the person and the agent: running, then succeeded with its output', async () => {
    const { kernel, fake, installed, sessionId } = await running();
    const [row] = await kernel.exec('kvcoder.job.list', { sessionId });
    fake.reply(runs(command('background', 'list'), command('background', 'output', { id: String(row?.id) })), says('done'));
    expect(row).toEqual({ id: expect.any(String) as unknown, kind: 'worker', title: 'pie', call: 'Helper', status: 'running', startedAt: expect.any(String) as unknown, links: [] });
    expect('output' in (await kernel.exec('kvcoder.job.get', { sessionId, id: String(row?.id) }))).toBe(false);
    installed.release();
    await requests(fake, 4);
    expect(await kernel.exec('kvcoder.job.get', { sessionId, id: String(row?.id) })).toMatchObject({ kind: 'worker', status: 'succeeded', exitCode: 0, endedAt: expect.any(String) as unknown, output: 'released' });
    const [listed, output] = toolResults(fake, 3).slice(-2).map((text) => JSON.parse(text) as unknown);
    expect(listed).toMatchObject([{ id: row?.id, kind: 'worker', title: 'pie', status: 'succeeded', exitCode: 0 }]);
    expect(output).toMatchObject({ id: row?.id, kind: 'worker', status: 'succeeded', output: 'released' });
  });

  it("QA32-H9 the person's Stop kills the program, and the chat is told the worker was stopped", async () => {
    const { kernel, fake, sessionId, pid } = await running();
    fake.reply(says('noted'));
    const [row] = await kernel.exec('kvcoder.job.list', { sessionId });
    expect(await kernel.exec('kvcoder.job.cancel', { sessionId, id: String(row?.id) })).toEqual({});
    await gone(pid);
    await told(kernel, sessionId, 'pie was stopped');
    expect(await kernel.exec('kvcoder.job.get', { sessionId, id: String(row?.id) })).toMatchObject({ status: 'cancelled', output: 'pie was stopped' });
  });

  // ADR 0108, 1: Stop ends the lead's turn and leaves its runs running.
  it('QA32-E9 cancelling the turn leaves the run running, and its answer still arrives', async () => {
    const installed = programs.install('pi');
    const { kernel, fake } = await kvcoder.start({ settings: workers(programWorker('pie', 'pi')) });
    const sessionId = await newSession(kernel);
    fake.reply(runs(delegate(`wait:${installed.gate}`)), { chunks: [{ wait: new Promise<void>(() => undefined) }, { text: 'never' }] }, says('read it'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await vi.waitFor(() => expect(installed.pid('pi')).toBeTypeOf('number'), wait);
    await requests(fake, 2);
    await kernel.exec('kvcoder.turn.cancel', { sessionId });
    await vi.waitFor(async () => expect((await turnState(kernel, sessionId)).turn).toMatchObject({ outcome: 'cancelled', pending: [] }), wait);
    expect(await notices(kernel, sessionId)).toEqual([{ code: 'CANCELLED', params: {} }]);
    expect(alive(Number(installed.pid('pi')))).toBe(true);
    expect((await kernel.exec('kvcoder.job.list', { sessionId })).map((row) => row.status)).toEqual(['running']);
    installed.release();
    await told(kernel, sessionId, 'released');
  });

  it('QA32-E10 deleting the chat kills its background run and forgets it', async () => {
    const { kernel, sessionId, pid } = await running();
    await kernel.exec('kvcoder.session.delete', { sessionId });
    await gone(pid);
    await expect(kernel.exec('kvcoder.job.list', { sessionId })).rejects.toMatchObject({ problem: { code: 'kvcoder/SESSION_NOT_FOUND' } });
  });

  // ADR 0108, 1: no turn waits on a run, so an interrupted run only tells the chat.
  it('QA32-E13 a background run whose job is interrupted tells the chat, and starts no turn', async () => {
    const { kernel, fake, sessionId } = await running();
    const sent = fake.requests().length;
    await kernel.restart();
    await kernel.clock.advance(0);
    await vi.waitFor(async () => expect(await kernel.exec('kvcoder.job.list', { sessionId })).toMatchObject([{ status: 'interrupted' }]), wait);
    const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 });
    expect(JSON.stringify(messages.find((message) => message.source?.kind === 'job')?.content)).toContain('pie was interrupted because kvman stopped.');
    expect(fake.requests()).toHaveLength(sent);
    expect((await turnState(kernel, sessionId)).session.status).toBe('idle');
  });

  it('QA32-E14 the agent stops a background run once: no message follows and no turn starts (ADR 0085, 5)', async () => {
    const { kernel, fake, sessionId, pid } = await running();
    const [row] = await kernel.exec('kvcoder.job.list', { sessionId });
    const stop = command('background', 'stop', { id: String(row?.id) });
    fake.reply(runs(stop), runs(stop), says('done'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'stop it' });
    await gone(pid);
    await vi.waitFor(async () => expect((await turnState(kernel, sessionId)).session.status).toBe('idle'), wait);
    expect(toolResults(fake, -2).at(-1)).toBe('{"stopped":true}');
    expect(toolResults(fake, -1).at(-1)).toBe('{"stopped":false}');
    const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 });
    expect(messages.filter((message) => JSON.stringify(message.content).includes('pie was stopped'))).toHaveLength(0);
  });
});
