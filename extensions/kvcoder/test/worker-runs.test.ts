import { describe, expect, it, vi } from 'vitest';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, requestMessages, runs, says, textOf, toolResults, unstamped } from './support/model-script.ts';
import { newSession, turnState } from './support/turns.ts';
import { wait } from './support/wait.ts';
import { programWorker, useWorkerPrograms } from './support/worker-programs.ts';
import { workers } from './support/workers.ts';

const kvcoder = useKvcoder();
const programs = useWorkerPrograms();

const delegate = (worker: string, task: string, fields: Record<string, unknown> = {}) => command('delegate', 'run', { worker, task, ...fields });
const requests = (fake: { requests(): readonly unknown[] }, count: number) => vi.waitFor(() => expect(fake.requests()).toHaveLength(count), wait);

describe("a program worker's run (08 §8.5, ADR 0021, 10 to 16 and 31 to 36)", { timeout: 30_000 }, () => {
  it('QA32-H4 a run suspends the turn, and the answer the program prints is the result', async () => {
    const installed = programs.install('claude');
    const { kernel, fake } = await kvcoder.start({ settings: workers(programWorker('cc', 'claude', { model: 'sonnet', instructions: 'Be brief.' })) });
    const sessionId = await newSession(kernel);
    fake.reply(runs(delegate('cc', `Review it\nwait:${installed.gate}`)), says('parent done'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await vi.waitFor(() => expect(installed.calls('claude')).toHaveLength(1), wait);
    const waiting = await turnState(kernel, sessionId);
    expect(waiting.session.status).toBe('waiting');
    expect(waiting.turn?.pending).toEqual([{ toolCallId: expect.any(String) as unknown, kind: 'worker', questionId: null, question: null, childSessionId: null, runId: expect.any(String) as unknown }]);
    expect(installed.calls('claude')).toEqual([{ cwd: kernel.homeFolder, args: ['-p', '--permission-mode', 'acceptEdits', '--model', 'sonnet', '--append-system-prompt', 'Be brief.', '--', `Review it\nwait:${installed.gate}`] }]);
    installed.release();
    await requests(fake, 2);
    expect(toolResults(fake, 1)).toEqual(['released']);
    await vi.waitFor(async () => expect((await turnState(kernel, sessionId)).turn).toMatchObject({ outcome: 'done', pending: [] }), wait);
  });

  it("QA32-H5 opencode's answer is read from its events, with the instructions before the task, and pi's is its output", async () => {
    const installed = programs.install('opencode', 'pi');
    const { kernel, fake } = await kvcoder.start({ settings: workers(programWorker('oc', 'opencode', { instructions: 'Be brief.' }), programWorker('pie', 'pi')) });
    const sessionId = await newSession(kernel);
    fake.reply(runs(delegate('oc', 'say:from opencode'), delegate('pie', 'say:from pi')), says('done'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await requests(fake, 2);
    expect(toolResults(fake, 1)).toEqual(['from opencode', 'from pi']);
    expect(installed.calls('opencode')[0]?.args).toEqual(['run', '--format', 'json', '--', 'Be brief.\n\nsay:from opencode']);
    expect(installed.calls('pi')[0]?.args).toEqual(['-p', '--', 'say:from pi']);
  });

  it('QA32-H6 a worker that asks first: allowed, the approval becomes the run; denied, nothing runs', async () => {
    const installed = programs.install('claude');
    const { kernel, fake } = await kvcoder.start({ settings: workers(programWorker('cc', 'claude', { approval: 'ask' })) });
    const sessionId = await newSession(kernel);
    fake.reply(runs(delegate('cc', `wait:${installed.gate}`), delegate('cc', 'say:never')), says('done'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    const asked = (await turnState(kernel, sessionId)).turn?.pending ?? [];
    expect(asked.map((item) => item.kind)).toEqual(['approval', 'approval']);
    expect(asked[0]?.question).toMatchObject({ connector: 'delegate', command: 'run', payload: { worker: 'cc', task: `wait:${installed.gate}` } });
    expect(installed.calls('claude')).toEqual([]);
    expect(await kernel.exec('kvcoder.question.answer', { questionId: String(asked[0]?.questionId), answer: { confirmed: true } })).toEqual({ jobId: null });
    await kernel.exec('kvcoder.question.answer', { questionId: String(asked[1]?.questionId), answer: { confirmed: false } });
    await vi.waitFor(() => expect(installed.calls('claude')).toHaveLength(1), wait);
    const running = await turnState(kernel, sessionId);
    expect(running.session.status).toBe('waiting');
    expect(running.turn?.pending).toMatchObject([{ toolCallId: asked[0]?.toolCallId, kind: 'worker', questionId: null, runId: expect.any(String) as unknown }]);
    installed.release();
    await requests(fake, 2);
    expect(toolResults(fake, 1)).toEqual(['released', 'denied by the user']);
    expect(installed.calls('claude')).toHaveLength(1);
  });

  it('QA32-H7 a background run returns its id, and its answer arrives as a message that starts a turn', async () => {
    const installed = programs.install('pi');
    const { kernel, fake } = await kvcoder.start({ settings: workers(programWorker('pie', 'pi')) });
    const sessionId = await newSession(kernel);
    fake.reply(runs(delegate('pie', `wait:${installed.gate}`, { background: true })), says('went on'), says('read it'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await vi.waitFor(async () => expect((await turnState(kernel, sessionId)).turn).toMatchObject({ outcome: 'done' }), wait);
    const [started] = toolResults(fake, 1);
    const runId = /^started ([0-9a-f-]{36})$/.exec(started ?? '')?.[1] ?? '';
    expect(runId).not.toBe('');
    installed.release();
    await requests(fake, 3);
    const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 });
    expect(messages.find((message) => message.source?.kind === 'job')?.source).toEqual({ kind: 'job', jobId: runId });
    expect(textOf(requestMessages(fake, 2).at(-1))).toBe(`The background call \`A test call.\` (job ${runId}) finished:\nreleased`);
  });

  it("QA32-H11 a run adds nothing to the chat's usage", async () => {
    programs.install('pi');
    const { kernel, fake } = await kvcoder.start({ settings: workers(programWorker('pie', 'pi')) });
    const sessionId = await newSession(kernel);
    const usage = { input: 10, output: 5 };
    fake.reply({ ...runs(delegate('pie', 'say:hi')), usage }, { ...says('done'), usage });
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await vi.waitFor(async () => expect((await turnState(kernel, sessionId)).turn).toMatchObject({ outcome: 'done' }), wait);
    const { session, turn } = await turnState(kernel, sessionId);
    expect(session.usage).toMatchObject({ input: 20, output: 10 });
    expect(turn?.usage).toMatchObject({ input: 20, output: 10 });
  });

  it('QA32-E2, QA32-E3, and QA32-E4 another exit code gives the error with the reasons, and no answer is an error too', async () => {
    programs.install('claude', 'opencode');
    const { kernel, fake } = await kvcoder.start({ settings: workers(programWorker('cc', 'claude'), programWorker('oc', 'opencode')) });
    const sessionId = await newSession(kernel);
    fake.reply(runs(delegate('cc', 'fail:3:no credit'), delegate('oc', 'fail:1:Rate limit exceeded.'), delegate('cc', 'silent')), says('done'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await requests(fake, 2);
    expect(toolResults(fake, 1)).toEqual(['cc exited with code 3\nno credit\npartial', 'oc exited with code 1\nRate limit exceeded.\npartial', 'cc returned no answer']);
    const rows = await kernel.exec('kvcoder.job.list', { sessionId });
    expect(rows.map((row) => [row.title, row.status, row.exitCode]).sort()).toEqual([['cc', 'failed', 0], ['cc', 'failed', 3], ['oc', 'failed', 1]]);
  });

  it("QA32-E6 a program removed after its check passed can't start, and the turn goes on", async () => {
    const installed = programs.install('pi');
    const { kernel, fake } = await kvcoder.start({ settings: workers(programWorker('pie', 'pi')) });
    const sessionId = await newSession(kernel);
    fake.reply(says('ready'), runs(delegate('pie', 'say:hi')), says('done'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'first' });
    await kernel.clock.advance(0);
    installed.remove('pi');
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await requests(fake, 3);
    expect(toolResults(fake, 2)[0]).toMatch(/^pie could not start: .*ENOENT/);
  });

  it('QA32-E11 a message while waiting on a run is queued, and one sent while its approval waits denies it', async () => {
    const installed = programs.install('pi');
    const { kernel, fake } = await kvcoder.start({ settings: workers(programWorker('pie', 'pi'), programWorker('asks', 'pi', { approval: 'ask' })) });
    const sessionId = await newSession(kernel);
    fake.reply(runs(delegate('pie', `wait:${installed.gate}`)), runs(delegate('asks', 'say:never')), says('done'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await vi.waitFor(() => expect(installed.calls('pi')).toHaveLength(1), wait);
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'also this' });
    expect((await turnState(kernel, sessionId)).session.status).toBe('waiting');
    expect(fake.requests()).toHaveLength(1);
    installed.release();
    await requests(fake, 2);
    expect(requestMessages(fake, 1).slice(-2).map((message) => [message.role, unstamped(textOf(message))])).toEqual([['tool', 'released'], ['user', 'also this']]);
    await vi.waitFor(async () => expect((await turnState(kernel, sessionId)).turn?.pending.map((item) => item.kind)).toEqual(['approval']), wait);
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'never mind' });
    await requests(fake, 3);
    expect(toolResults(fake, 2).at(-1)).toBe('denied by the user');
    expect(installed.calls('pi')).toHaveLength(1);
  });

  it('QA32-E12 two runs in one reply run at the same time, and their results keep the call order', async () => {
    const installed = programs.install('pi', 'claude');
    const { kernel, fake } = await kvcoder.start({ settings: workers(programWorker('pie', 'pi'), programWorker('cc', 'claude')) });
    const sessionId = await newSession(kernel);
    fake.reply(runs(delegate('pie', `wait:${installed.gate}`), delegate('cc', 'say:quick')), says('done'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await vi.waitFor(async () => expect((await kernel.exec('kvcoder.job.list', { sessionId })).map((row) => [row.title, row.status]).sort()).toEqual([['cc', 'succeeded'], ['pie', 'running']]), wait);
    expect((await turnState(kernel, sessionId)).turn?.pending.map((item) => item.kind)).toEqual(['worker']);
    installed.release();
    await requests(fake, 2);
    expect(toolResults(fake, 1)).toEqual(['released', 'quick']);
  });

  it('QA32-E15 a run keeps the command line it started with, and a worker removed before its approval gives the error', async () => {
    const installed = programs.install('pi');
    const { kernel, fake } = await kvcoder.start({ settings: workers(programWorker('pie', 'pi'), programWorker('asks', 'pi', { approval: 'ask' })) });
    const sessionId = await newSession(kernel);
    fake.reply(runs(delegate('pie', `wait:${installed.gate}`), delegate('asks', 'say:never')), says('done'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await vi.waitFor(() => expect(installed.calls('pi')).toHaveLength(1), wait);
    await kernel.exec('kernel.settings.set', { key: 'kvcoder.delegate.workers', value: [], scope: 'global' });
    const approval = (await turnState(kernel, sessionId)).turn?.pending.find((item) => item.kind === 'approval');
    await kernel.exec('kvcoder.question.answer', { questionId: String(approval?.questionId), answer: { confirmed: true } });
    installed.release();
    await requests(fake, 2);
    expect(toolResults(fake, 1)).toEqual(['released', 'error kvcoder/WORKER_NOT_FOUND: There is no worker asks. No worker is available.']);
  });
});
