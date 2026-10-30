import { describe, expect, it, vi } from 'vitest';
import type { TestKernel } from '@kvman/testkit';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, requestMessages, runs, says, textOf, toolResults, unstamped } from './support/model-script.ts';
import { newSession, turnState } from './support/turns.ts';
import { wait } from './support/wait.ts';
import { programWorker, useWorkerPrograms } from './support/worker-programs.ts';
import { workers } from './support/workers.ts';

// Every program worker's run goes on in the background (ADR 0108, 1): its call returns `started <runId>` at once, and
// the program's answer arrives as the run's background message.

const kvcoder = useKvcoder();
const programs = useWorkerPrograms();

const delegate = (worker: string, goal: string) => command('delegate', 'run', { worker, title: 'Helper', kind: 'find', goal, done: 'It is done.' });
const brief = (goal: string) => `Kind: find\nGoal: ${goal}\nDone when: It is done.`;
const requests = (fake: { requests(): readonly unknown[] }, count: number) => vi.waitFor(() => expect(fake.requests()).toHaveLength(count), wait);
const startedId = (text: string | undefined): string => /^started ([0-9a-f-]{36})$/.exec(text ?? '')?.[1] ?? '';
const idle = (kernel: TestKernel, sessionId: string) => vi.waitFor(async () => expect((await turnState(kernel, sessionId)).turn).toMatchObject({ outcome: 'done', pending: [] }), wait);

// The answers of the chat's runs, once `count` have arrived: each run's id and the text after its "finished:" line.
async function answers(kernel: TestKernel, sessionId: string, count: number): Promise<{ id: string; text: string }[]> {
  return vi.waitFor(async () => {
    const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 });
    const found = messages.flatMap((message) => (message.source?.kind === 'job' ? [String(message.content['content'])] : []));
    expect(found).toHaveLength(count);
    return found.map((content) => {
      const [, id = '', text = ''] = /^The background call `Helper` \(job (\S+)\) finished:\n([\s\S]*)$/.exec(content) ?? [];
      return { id, text };
    });
  }, wait);
}

describe("a program worker's run (08 §8.5, ADR 0021, 10 to 16 and 31 to 36; ADR 0108, 1)", { timeout: 30_000 }, () => {
  it('QA32-H4 a run goes on in the background with its brief as the task, and the answer the program prints is its message', async () => {
    const installed = programs.install('claude');
    const { kernel, fake } = await kvcoder.start({ settings: workers(programWorker('cc', 'claude', { model: 'sonnet', instructions: 'Be brief.' })) });
    const sessionId = await newSession(kernel);
    fake.reply(runs(delegate('cc', `wait:${installed.gate}`)), says('Started.'), says('read it'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await vi.waitFor(() => expect(installed.calls('claude')).toHaveLength(1), wait);
    await idle(kernel, sessionId);
    const runId = startedId(toolResults(fake, 1)[0]);
    expect(runId).not.toBe('');
    expect(installed.calls('claude')).toEqual([{ cwd: kernel.homeFolder, args: ['-p', '--permission-mode', 'acceptEdits', '--model', 'sonnet', '--append-system-prompt', 'Be brief.', '--', brief(`wait:${installed.gate}`)] }]);
    installed.release();
    expect(await answers(kernel, sessionId, 1)).toEqual([{ id: runId, text: 'released' }]);
  });

  it("QA32-H5 opencode's answer is read from its events, with the instructions before the task, and pi's is its output", async () => {
    const installed = programs.install('opencode', 'pi');
    const { kernel, fake } = await kvcoder.start({ settings: workers(programWorker('oc', 'opencode', { instructions: 'Be brief.' }), programWorker('pie', 'pi')) });
    const sessionId = await newSession(kernel);
    fake.reply(runs(delegate('oc', 'say:from opencode'), delegate('pie', 'say:from pi')), says('Started.'), says('read'), says('read'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    expect((await answers(kernel, sessionId, 2)).map((answer) => answer.text).sort()).toEqual(['from opencode', 'from pi']);
    expect(installed.calls('opencode')[0]?.args).toEqual(['run', '--format', 'json', '--', `Be brief.\n\n${brief('say:from opencode')}`]);
    expect(installed.calls('pi')[0]?.args).toEqual(['-p', '--', brief('say:from pi')]);
  });

  it('QA32-H6 a worker that asks first: allowed, the approval starts the run; denied, nothing runs', async () => {
    const installed = programs.install('claude');
    const { kernel, fake } = await kvcoder.start({ settings: workers(programWorker('cc', 'claude', { approval: 'ask' })) });
    const sessionId = await newSession(kernel);
    fake.reply(runs(delegate('cc', `wait:${installed.gate}`), delegate('cc', 'say:never')), says('done'), says('read it'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    const asked = (await turnState(kernel, sessionId)).turn?.pending ?? [];
    expect(asked.map((item) => item.kind)).toEqual(['approval', 'approval']);
    expect(asked[0]?.question).toMatchObject({ connector: 'delegate', command: 'run', payload: { worker: 'cc', title: 'Helper', kind: 'find', goal: `wait:${installed.gate}`, done: 'It is done.' } });
    expect(installed.calls('claude')).toEqual([]);
    await kernel.exec('kvcoder.question.answer', { questionId: String(asked[0]?.questionId), answer: { confirmed: true } });
    await kernel.exec('kvcoder.question.answer', { questionId: String(asked[1]?.questionId), answer: { confirmed: false } });
    await vi.waitFor(() => expect(installed.calls('claude')).toHaveLength(1), wait);
    await requests(fake, 2);
    const [started, denied] = toolResults(fake, 1);
    expect([startedId(started) !== '', denied]).toEqual([true, 'denied by the user']);
    installed.release();
    expect(await answers(kernel, sessionId, 1)).toEqual([{ id: startedId(started), text: 'released' }]);
    expect(installed.calls('claude')).toHaveLength(1);
  });

  it('QA32-H7 a run returns its id, and its answer arrives as a message that starts a turn', async () => {
    const installed = programs.install('pi');
    const { kernel, fake } = await kvcoder.start({ settings: workers(programWorker('pie', 'pi')) });
    const sessionId = await newSession(kernel);
    fake.reply(runs(delegate('pie', `wait:${installed.gate}`)), says('went on'), says('read it'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await idle(kernel, sessionId);
    const runId = startedId(toolResults(fake, 1)[0]);
    expect(runId).not.toBe('');
    installed.release();
    await requests(fake, 3);
    const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 });
    expect(messages.find((message) => message.source?.kind === 'job')?.source).toEqual({ kind: 'job', jobId: runId });
    expect(textOf(requestMessages(fake, 2).at(-1))).toBe(`The background call \`Helper\` (job ${runId}) finished:\nreleased`);
  });

  it("QA32-H11 a run adds nothing to the chat's usage", async () => {
    programs.install('pi');
    const { kernel, fake } = await kvcoder.start({ settings: workers(programWorker('pie', 'pi')) });
    const sessionId = await newSession(kernel);
    const usage = { input: 10, output: 5 };
    fake.reply({ ...runs(delegate('pie', 'say:hi')), usage }, { ...says('done'), usage }, says('read it'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await answers(kernel, sessionId, 1);
    await requests(fake, 3);
    await idle(kernel, sessionId);
    expect((await turnState(kernel, sessionId)).session.usage).toMatchObject({ input: 20, output: 10 });
  });

  it('QA32-E2, QA32-E3, and QA32-E4 another exit code gives the error with the reasons, and no answer is an error too', async () => {
    programs.install('claude', 'opencode');
    const { kernel, fake } = await kvcoder.start({ settings: workers(programWorker('cc', 'claude'), programWorker('oc', 'opencode')) });
    const sessionId = await newSession(kernel);
    fake.reply(runs(delegate('cc', 'fail:3:no credit'), delegate('oc', 'fail:1:Rate limit exceeded.'), delegate('cc', 'silent')), says('done'), says('read'), says('read'), says('read'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    expect((await answers(kernel, sessionId, 3)).map((answer) => answer.text).sort()).toEqual(['cc exited with code 3\nno credit\npartial', 'cc returned no answer', 'oc exited with code 1\nRate limit exceeded.\npartial']);
    const rows = await kernel.exec('kvcoder.job.list', { sessionId });
    expect(rows.map((row) => [row.title, row.status, row.exitCode]).sort()).toEqual([['cc', 'failed', 0], ['cc', 'failed', 3], ['oc', 'failed', 1]]);
  });

  it("QA32-E6 a program removed after its check passed can't start, and its message says so", async () => {
    const installed = programs.install('pi');
    const { kernel, fake } = await kvcoder.start({ settings: workers(programWorker('pie', 'pi')) });
    const sessionId = await newSession(kernel);
    fake.reply(says('ready'), runs(delegate('pie', 'say:hi')), says('done'), says('read it'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'first' });
    await kernel.clock.advance(0);
    installed.remove('pi');
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    const [answer] = await answers(kernel, sessionId, 1);
    expect(answer?.text).toMatch(/^pie could not start: .*ENOENT/);
  });

  it('QA32-E11 a message while a run works starts a turn at once, and one sent while an approval waits denies it', async () => {
    const installed = programs.install('pi');
    const { kernel, fake } = await kvcoder.start({ settings: workers(programWorker('pie', 'pi'), programWorker('asks', 'pi', { approval: 'ask' })) });
    const sessionId = await newSession(kernel);
    fake.reply(runs(delegate('pie', `wait:${installed.gate}`)), says('Started.'), runs(delegate('asks', 'say:never')), says('done'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await vi.waitFor(() => expect(installed.calls('pi')).toHaveLength(1), wait);
    await idle(kernel, sessionId);
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'also this' });
    await vi.waitFor(async () => expect((await turnState(kernel, sessionId)).turn?.pending.map((item) => item.kind)).toEqual(['approval']), wait);
    expect(unstamped(textOf(requestMessages(fake, 2).at(-1)))).toMatch(/^also this/);
    expect((await kernel.exec('kvcoder.job.list', { sessionId })).map((row) => row.status)).toEqual(['running']);
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'never mind' });
    await requests(fake, 4);
    expect(toolResults(fake, 3).at(-1)).toBe('denied by the user');
    expect(installed.calls('pi')).toHaveLength(1);
    installed.release();
  });

  it('QA32-E12 two runs in one reply run at the same time, and their results keep the call order', async () => {
    const installed = programs.install('pi', 'claude');
    const { kernel, fake } = await kvcoder.start({ settings: workers(programWorker('pie', 'pi'), programWorker('cc', 'claude')) });
    const sessionId = await newSession(kernel);
    fake.reply(runs(delegate('pie', `wait:${installed.gate}`), delegate('cc', 'say:quick')), says('done'), says('read'), says('read'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await vi.waitFor(async () => expect((await kernel.exec('kvcoder.job.list', { sessionId })).map((row) => [row.title, row.status]).sort()).toEqual([['cc', 'succeeded'], ['pie', 'running']]), wait);
    const [pie, cc] = toolResults(fake, 1).map(startedId);
    const rows = await kernel.exec('kvcoder.job.list', { sessionId });
    expect([pie, cc]).toEqual([rows.find((row) => row.title === 'pie')?.id, rows.find((row) => row.title === 'cc')?.id]);
    installed.release();
    expect((await answers(kernel, sessionId, 2)).sort((a, b) => a.text.localeCompare(b.text))).toEqual([{ id: cc, text: 'quick' }, { id: pie, text: 'released' }]);
  });

  it('QA32-E15 a run keeps the command line it started with, and a worker removed before its approval gives the error', async () => {
    const installed = programs.install('pi');
    const { kernel, fake } = await kvcoder.start({ settings: workers(programWorker('pie', 'pi'), programWorker('asks', 'pi', { approval: 'ask' })) });
    const sessionId = await newSession(kernel);
    fake.reply(runs(delegate('pie', `wait:${installed.gate}`), delegate('asks', 'say:never')), says('done'), says('read it'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await vi.waitFor(() => expect(installed.calls('pi')).toHaveLength(1), wait);
    await kernel.exec('kernel.settings.set', { key: 'kvcoder.delegate.workers', value: [], scope: 'global' });
    const approval = await vi.waitFor(async () => {
      const found = (await turnState(kernel, sessionId)).turn?.pending.find((item) => item.kind === 'approval');
      expect(found).toBeDefined();
      return found;
    }, wait);
    await kernel.exec('kvcoder.question.answer', { questionId: String(approval?.questionId), answer: { confirmed: true } });
    await requests(fake, 2);
    const [started, refused] = toolResults(fake, 1);
    expect(refused).toBe('error kvcoder/WORKER_NOT_FOUND: There is no worker asks. No worker is available.');
    installed.release();
    expect(await answers(kernel, sessionId, 1)).toEqual([{ id: startedId(started), text: 'released' }]);
  });
});
