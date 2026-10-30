import { describe, expect, it, vi } from 'vitest';
import { z } from '@kvman/sdk';
import type { TestKernel } from '@kvman/testkit';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { delegated, helperIds, type Helped } from './support/helpers.ts';
import { command, requestMessages, runs, says, textOf, toolResults } from './support/model-script.ts';
import { newSession } from './support/turns.ts';
import { wait } from './support/wait.ts';
import { programWorker, useWorkerPrograms } from './support/worker-programs.ts';
import { brief, worker, workers } from './support/workers.ts';

// `delegate continue` resumes a helper with its history, in the background (plan 08 §8.5, ADR 0085, 4; ADR 0108, 1).

const kvcoder = useKvcoder();
const programs = useWorkerPrograms();
const run = () => command('delegate', 'run', brief('helper', { goal: 'Do it' }));
const proceed = (id: string, payload: Record<string, unknown> = {}) => command('delegate', 'continue', { id, message: 'Now add the test.', ...payload });
const helperMessages = async (kernel: TestKernel, id: string) => (await kernel.exec('kvcoder.message.list', { sessionId: id, limit: 100 })).messages.length;
const lastBody = (world: Helped): string => JSON.stringify(world.fake.requests().at(-1)?.body);

// A chat whose helper answered once.
async function answeredHelper(world: Helped) {
  const sessionId = await newSession(world.kernel);
  await delegated(world, sessionId, [runs(run()), says('Started.'), says('Read it.')], [says('first answer')]);
  const [id = ''] = await helperIds(world.kernel, sessionId);
  return { sessionId, id };
}

describe('delegate continue (ADR 0085, 4)', { timeout: 60_000 }, () => {
  it('QA53-H12 QA67-E20 a helper is continued with its history, in the background', async () => {
    const world = await kvcoder.start({ settings: workers(worker('helper')) });
    const { kernel, fake, helperFake } = world;
    const { sessionId, id } = await answeredHelper(world);
    expect(lastBody(world)).toContain(`first answer\\n\\n(helper ${id})`);
    const before = await kernel.exec('kvcoder.session.get', { sessionId: id });
    await delegated(world, sessionId, [runs(proceed(id)), says('Continued.'), says('Read it.')], [says('second answer')]);
    expect(fake.requests().some((_, index) => toolResults(fake, index).includes(`started ${id}\n\n(helper ${id})`))).toBe(true);
    const helperRequest = requestMessages(helperFake, 1).map((message) => `${message.role}:${textOf(message)}`);
    expect(helperRequest.filter((line) => !line.startsWith('system:') && !line.startsWith('developer:'))).toEqual([expect.stringMatching(/^user:.*Do it/s), 'assistant:first answer', expect.stringMatching(/^user:.*Now add the test\./s)]);
    expect(lastBody(world)).toContain(`second answer\\n\\n(helper ${id})`);
    const after = await kernel.exec('kvcoder.session.get', { sessionId: id });
    expect({ worker: after.worker, model: after.model, thinking: after.thinking }).toEqual({ worker: before.worker, model: before.model, thinking: before.thinking });
  });

  it("QA53-E11 QA67-E21 continue refuses what it can't continue", async () => {
    const world = await kvcoder.start({ settings: workers(worker('helper')) });
    const { kernel, fake } = world;
    const { sessionId, id } = await answeredHelper(world);
    const other = await newSession(kernel);
    await delegated(world, other, [runs(run()), says('Started.'), says('Read it.')], [says('other answer')]);
    const [otherHelper = ''] = await helperIds(kernel, other);
    const counted = await helperMessages(kernel, id);
    await delegated(world, sessionId, [runs(proceed('nope'), proceed(otherHelper), command('delegate', 'continue', { id })), says('ok')], []);
    const [unknown, foreign, noMessage] = toolResults(fake).slice(-3);
    expect(unknown).toMatch(/^error kvcoder\/JOB_NOT_FOUND: /);
    expect(foreign).toMatch(/^error kvcoder\/JOB_NOT_FOUND: /);
    expect(noMessage).toMatch(/^error VALIDATION_FAILED: /);
    expect(await helperMessages(kernel, id)).toBe(counted);

    // A world of its own: a program worker checks its program at a chat's first step, which reorders the requests.
    programs.install('pi');
    const programWorld = await kvcoder.start({ settings: workers(programWorker('runner', 'pi', { approval: 'auto' })) });
    const programChat = await newSession(programWorld.kernel);
    await delegated(programWorld, programChat, [runs(command('delegate', 'run', brief('runner', { title: 'Runner', goal: 'say:hi' }))), says('Started.'), says('Read it.')], []);
    const runner = (await programWorld.kernel.exec('kvcoder.job.list', { sessionId: programChat })).find((job) => job.kind === 'worker')?.id ?? '';
    await delegated(programWorld, programChat, [runs(proceed(runner)), says('ok')], []);
    expect(toolResults(programWorld.fake).at(-1)).toMatch(/^error VALIDATION_FAILED: .*program worker's run/);
  });

  it("QA67-H20 continue to a helper still working queues the message, and the helper's next step reads it", async () => {
    const world = await kvcoder.start({ settings: workers(worker('helper')) });
    const { kernel, fake, helperFake } = world;
    const sessionId = await newSession(kernel);
    let release = (): void => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    fake.reply(runs(run()), says('Started.'));
    helperFake.reply({ chunks: [{ wait: held }, { text: 'first pass' }] }, says('with the test'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await vi.waitFor(async () => expect((await kernel.exec('kvcoder.session.get', { sessionId })).status).toBe('idle'), wait);
    const [busy = ''] = await helperIds(kernel, sessionId);
    fake.reply(runs(proceed(busy)), says('ok'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go on' });
    await vi.waitFor(() => expect(toolResults(fake).at(-1)).toBe(`queued for ${busy}: it reads this at its next step, and its answer comes as a background message\n\n(helper ${busy})`), wait);
    fake.reply(says('noted'), says('noted'));
    release();
    await vi.waitFor(() => expect(helperFake.requests()).toHaveLength(2), wait);
    expect(textOf(requestMessages(helperFake, 1).at(-1))).toMatch(/Now add the test\./);
    await vi.waitFor(async () => {
      const { messages } = await kernel.exec('kvcoder.message.list', { sessionId, limit: 100 });
      expect(JSON.stringify(messages)).toContain(`with the test\\n\\n(helper ${busy})`);
    }, wait);
  });

  it('QA53-E12 continue rechecks the grants', async () => {
    const world = await kvcoder.start({ settings: workers(worker('helper'), worker('other')) });
    const { sessionId, id } = await answeredHelper(world);
    const counted = await helperMessages(world.kernel, id);
    await world.kernel.exec('kernel.settings.set', { key: 'kvcoder.delegate.workers', value: [worker('helper', { enabled: false }), worker('other')], scope: 'global' });
    await delegated(world, sessionId, [runs(proceed(id)), says('ok')], []);
    expect(toolResults(world.fake).at(-1)).toMatch(/^error kvcoder\/WORKER_NOT_FOUND: There is no worker helper\./);
    expect(await helperMessages(world.kernel, id)).toBe(counted);
  });

  it("QA53-E13 a stopped helper's result still ends with its id, and it can be continued", async () => {
    const world = await kvcoder.start({ settings: workers(worker('helper')) });
    const { kernel, fake, helperFake } = world;
    const sessionId = await newSession(kernel);
    fake.reply(runs(run()), says('Started.'));
    helperFake.reply({ chunks: [{ wait: new Promise<void>(() => undefined) }, { text: 'never' }] });
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await vi.waitFor(async () => expect((await kernel.exec('kvcoder.session.get', { sessionId })).status).toBe('idle'), wait);
    const [id = ''] = await helperIds(kernel, sessionId);
    await delegated(world, sessionId, [runs(command('background', 'stop', { id })), runs(command('background', 'output', { id })), says('ok')], []);
    const output = z.object({ output: z.string() }).parse(JSON.parse(toolResults(fake).at(-1) ?? '{}')).output;
    expect(output).toMatch(new RegExp(`^subagent ended cancelled[\\s\\S]*\\n\\n\\(helper ${id}\\)$`));
    await delegated(world, sessionId, [runs(proceed(id)), says('Continued.'), says('Read it.')], [says('back again')]);
    expect(lastBody(world)).toContain(`back again\\n\\n(helper ${id})`);
  });
});
