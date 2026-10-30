import { describe, expect, it, vi } from 'vitest';
import type { TestKernel } from '@kvman/testkit';
import { wait } from './support/wait.ts';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, requestMessages, runs, says, shell, systemPrompt, textOf, toolResults } from './support/model-script.ts';
import { newSession, turnState } from './support/turns.ts';
import { programWorker, useWorkerPrograms } from './support/worker-programs.ts';
import { brief, workers } from './support/workers.ts';

// Delegate runs (08 §8.5, ADR 0021): every run goes on in the background, and its answer arrives as a message
// (ADR 0108, 1). The helpers answer from their own fake server.

const kvcoder = useKvcoder();
const programs = useWorkerPrograms();
const startedIds = (results: readonly string[]): string[] => results.flatMap((text) => /^started (\S+)/.exec(text)?.[1] ?? []);
const arrived = async (kernel: TestKernel, sessionId: string) => (await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 })).messages.filter((message) => message.source?.kind === 'subagent');

describe('delegate runs (08 §8.5, ADR 0021; ADR 0108, 1)', { timeout: 30_000 }, () => {
  it('M2.4-H4 and QA71-H1 two helpers run at once, each call returns at once, and their answers arrive as messages', async () => {
    const { kernel, fake, helperFake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    let release = (): void => undefined;
    const both = new Promise<void>((resolve) => (release = resolve));
    fake.reply(runs(command('delegate', 'run', brief('general', { goal: 'Task A' })), command('delegate', 'run', brief('general', { goal: 'Task B' }))), says('Both started.'), says('Read one.'), says('Read the other.'));
    helperFake.reply({ chunks: [{ wait: both }, { text: 'first answer' }] }, { chunks: [{ wait: both }, { text: 'second answer' }] });
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'split it' });
    await vi.waitFor(() => expect(helperFake.requests()).toHaveLength(2), wait);
    await vi.waitFor(async () => expect((await kernel.exec('kvcoder.session.get', { sessionId })).status).toBe('idle'), wait);
    const ids = startedIds(toolResults(fake, 1));
    expect(toolResults(fake, 1)).toEqual(ids.map((id) => `started ${id}\n\n(helper ${id})`));
    const briefs = [0, 1].map((index) => textOf(requestMessages(helperFake, index).find((message) => message.role === 'user'))).sort();
    expect(briefs).toEqual(['Kind: find\nGoal: Task A\nDone when: It is looked at.', 'Kind: find\nGoal: Task B\nDone when: It is looked at.']);
    expect(systemPrompt(helperFake, 0)).toContain('You are kvman Coder');
    for (const id of ids) expect(await kernel.exec('kvcoder.session.get', { sessionId: id })).toMatchObject({ parentId: sessionId, model: 'helper/m1', thinking: 'medium', run: { kind: 'find', budget: 60 } });
    expect((await kernel.exec('kvcoder.session.list', { limit: 100 })).map((session) => session.id)).not.toContain(ids[0]);
    release();
    await kernel.clock.advance(0);
    await vi.waitFor(async () => expect((await arrived(kernel, sessionId)).map((message) => String(message.content['content']).includes('answer'))).toEqual([true, true]), wait);
  });

  it('M2.4-E44 a helper returns its id, and its answer arrives later as a message that wakes the idle lead', async () => {
    const { kernel, fake, helperFake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    let release = (): void => undefined;
    const later = new Promise<void>((resolve) => (release = resolve));
    fake.reply(runs(command('delegate', 'run', brief('general', { goal: 'Background task' }))), says('Started it.'), says('Got the answer.'));
    helperFake.reply({ chunks: [{ wait: later }, { text: 'one' }] });
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await vi.waitFor(async () => expect((await kernel.exec('kvcoder.session.get', { sessionId })).status).toBe('idle'), wait);
    const [childId = ''] = startedIds(toolResults(fake, 1));
    expect((await kernel.exec('kvcoder.session.get', { sessionId: childId })).parentId).toBe(sessionId);
    release();
    await kernel.clock.advance(0);
    await vi.waitFor(() => expect(fake.requests()).toHaveLength(3), wait);
    const [message] = await arrived(kernel, sessionId);
    expect(message?.source).toEqual({ kind: 'subagent', sessionId: childId });
    expect(String(message?.content['content'])).toBe(`The background call \`Helper\` (job ${childId}) finished:\none\n\n(helper ${childId})`);
    expect(await kernel.exec('kvcoder.turn.list', { sessionId, limit: 10 })).toHaveLength(2);
  });

  it("QA49-H1 and QA57-H5 a run's title names its helper: the child session's title, and the run's title and call in the job list", async () => {
    const { kernel, fake, helperFake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply(runs(command('delegate', 'run', brief('general', { title: 'Node.js expert', goal: 'Find why the pool leaks handles.' }))), says('one'), says('two'));
    helperFake.reply(says('the cause'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    const [childId = ''] = startedIds(toolResults(fake, 1));
    expect((await kernel.exec('kvcoder.session.get', { sessionId: childId })).title).toBe('Node.js expert');
    expect((await kernel.exec('kvcoder.job.list', { sessionId })).map((job) => [job.id, job.kind, job.title, job.call])).toEqual([[childId, 'subagent', 'Node.js expert', 'Node.js expert']]);
  });

  it('QA49-E1 / E155 a run needs its title: none, or one of 201 characters, fails VALIDATION_FAILED and makes no helper', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    const { title: _title, ...untitled } = brief('general', { goal: 'Task A' });
    fake.reply(runs(command('delegate', 'run', untitled), command('delegate', 'run', brief('general', { title: 't'.repeat(201), goal: 'Task B' }))), says('done'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    const refused = toolResults(fake);
    expect(refused).toHaveLength(2);
    for (const text of refused) {
      expect(text).toMatch(/^error VALIDATION_FAILED: title: /);
      expect(text.includes('The payload of delegate run is\n{ worker, title (≤200), kind: "find" | "change" | "check" | "review", goal (≤300), done (≤300), files?, context?: [{ path, fromLine?, lines? }], budget? }\n\n')).toBe(true);
    }
    expect(await kernel.exec('kvcoder.job.list', { sessionId })).toEqual([]);
  });

  it("M2.4-E46 a helper's approval shows while the lead goes on, and the answer continues the helper", async () => {
    const { kernel, fake, helperFake } = await kvcoder.start({ settings: { 'kvcoder.approval': 'ask' } });
    const sessionId = await newSession(kernel);
    fake.reply(runs(command('delegate', 'run', brief('general', { kind: 'check', goal: 'Check' }))), says('Started.'), says('parent done'));
    helperFake.reply(runs(shell('echo child')), says('child done'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    const [childId = ''] = startedIds(toolResults(fake, 1));
    await vi.waitFor(async () => expect((await turnState(kernel, childId)).session.status).toBe('waiting'), wait);
    expect((await turnState(kernel, sessionId)).session.status).toBe('idle');
    const child = await turnState(kernel, childId);
    expect(child.turn?.pending[0]).toMatchObject({ kind: 'approval', question: { connector: 'shell', command: 'exec', payload: { line: 'echo child' } } });
    await kernel.exec('kvcoder.question.answer', { questionId: String(child.turn?.pending[0]?.questionId), answer: { confirmed: true } });
    await kernel.clock.advance(0);
    expect(toolResults(helperFake, 1)).toEqual(['child\n[exit code 0]']);
    await vi.waitFor(() => expect(fake.requests()).toHaveLength(3), wait);
    expect((await turnState(kernel, sessionId)).turn).toMatchObject({ outcome: 'done' });
  });

  it("QA71-H5 a program worker's run returns at once, and its answer arrives as the run's message", async () => {
    programs.install('opencode');
    const { kernel, fake } = await kvcoder.start({ settings: workers(programWorker('oc', 'opencode', { approval: 'auto' })) });
    const sessionId = await newSession(kernel);
    fake.reply(runs(command('delegate', 'run', brief('oc', { goal: 'say:found it' }))), says('Started.'), says('Read it.'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    const [runId = ''] = startedIds(toolResults(fake, 1));
    expect(toolResults(fake, 1)).toEqual([`started ${runId}`]);
    const answer = await vi.waitFor(async () => {
      const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 });
      const found = messages.find((message) => message.source?.kind === 'job');
      expect(found).toBeDefined();
      return found;
    }, wait);
    expect(answer?.source).toEqual({ kind: 'job', jobId: runId });
    expect(String(answer?.content['content'])).toBe(`The background call \`Helper\` (job ${runId}) finished:\nfound it`);
  });
});
