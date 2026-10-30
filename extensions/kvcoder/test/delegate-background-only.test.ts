import { describe, expect, it, vi } from 'vitest';
import type { TestKernel } from '@kvman/testkit';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, requestMessages, runs, says, textOf, toolResults } from './support/model-script.ts';
import { newSession, turnState } from './support/turns.ts';
import { wait } from './support/wait.ts';
import { brief } from './support/workers.ts';

// Every delegation runs in the background (plan 08 §8.5, ADR 0108, 1): the lead goes on, the person's message reaches
// it, Stop leaves helpers running, and a helper ends at its run's budget.

const kvcoder = useKvcoder();
const startedIds = (results: readonly string[]): string[] => results.flatMap((text) => /^started (\S+)/.exec(text)?.[1] ?? []);
const idle = async (kernel: TestKernel, sessionId: string): Promise<void> => vi.waitFor(async () => expect((await kernel.exec('kvcoder.session.get', { sessionId })).status).toBe('idle'), wait);

// A lead that started one helper, which holds its reply until released.
async function startedHelper(fields: Record<string, unknown> = {}) {
  const world = await kvcoder.start();
  const sessionId = await newSession(world.kernel);
  let release = (): void => undefined;
  const held = new Promise<void>((resolve) => (release = resolve));
  world.fake.reply(runs(command('delegate', 'run', brief('general', fields as never))), says('Started.'));
  world.helperFake.reply({ chunks: [{ wait: held }, { text: 'the answer' }] });
  await world.kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
  await idle(world.kernel, sessionId);
  const [helperId = ''] = startedIds(toolResults(world.fake, 1));
  return { ...world, sessionId, helperId, release };
}

describe('background-only delegation (ADR 0108, 1)', { timeout: 30_000 }, () => {
  it("QA71-H2 and QA71-H3 the lead is idle while its helper runs, the person's message starts a turn at once, and the answer wakes the lead", async () => {
    const { kernel, fake, sessionId, helperId, release } = await startedHelper();
    expect((await kernel.exec('kvcoder.session.get', { sessionId: helperId })).status).toBe('running');
    fake.reply(says('Still working on it.'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'how is it going?' });
    await vi.waitFor(() => expect(fake.requests()).toHaveLength(3), wait);
    expect(textOf(requestMessages(fake, 2).at(-1))).toContain('how is it going?');
    await idle(kernel, sessionId);
    fake.reply(says('Got it.'));
    release();
    await kernel.clock.advance(0);
    await vi.waitFor(() => expect(fake.requests()).toHaveLength(4), wait);
    expect(textOf(requestMessages(fake, 3).at(-1))).toContain('finished:\nthe answer');
  });

  it('QA71-H4 Stop ends the lead\'s turn and leaves its helper running', async () => {
    const { kernel, fake, helperFake, sessionId, release } = await kvcoder.start().then(async (world) => {
      const id = await newSession(world.kernel);
      let open = (): void => undefined;
      const held = new Promise<void>((resolve) => (open = resolve));
      const leadHeld = new Promise<void>(() => undefined);
      world.fake.reply(runs(command('delegate', 'run', brief('general'))), { chunks: [{ wait: leadHeld }, { text: 'never' }] });
      world.helperFake.reply({ chunks: [{ wait: held }, { text: 'the answer' }] });
      await world.kernel.exec('kvcoder.message.send', { sessionId: id, text: 'go' });
      await vi.waitFor(() => expect(world.fake.requests()).toHaveLength(2), wait);
      return { ...world, sessionId: id, release: open };
    });
    await kernel.exec('kvcoder.turn.cancel', { sessionId });
    // The held helper keeps a job running, which the fake clock's advance would wait for.
    await vi.waitFor(async () => expect((await turnState(kernel, sessionId)).turn?.outcome).toBe('cancelled'), wait);
    const [helper] = (await kernel.exec('kvcoder.job.list', { sessionId })).filter((job) => job.kind === 'subagent');
    expect(helper?.status).toBe('running');
    fake.reply(says('Read it.'));
    release();
    await vi.waitFor(async () => expect((await kernel.exec('kvcoder.session.get', { sessionId: helper?.id ?? 'none' })).status).toBe('idle'), wait);
    expect(helperFake.requests()).toHaveLength(1);
  });
});

describe("a run's budget (ADR 0108, 2)", { timeout: 30_000 }, () => {
  it("QA71-H10 and QA71-E10 a helper's turn ends at its budget with its last message, and a continue gets the budget again", async () => {
    const { kernel, fake, helperFake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    fake.reply(runs(command('delegate', 'run', brief('general', { budget: 3 }))), says('Started.'), says('It stopped.'));
    helperFake.reply(...Array.from({ length: 3 }, (_, index) => ({ chunks: [{ text: `step ${String(index + 1)}` }, { toolCall: { id: `list-${String(index)}`, name: 'run', arguments: { connector: 'fs', command: 'list', payload: {} } } }] })));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    await vi.waitFor(() => expect(fake.requests()).toHaveLength(3), wait);
    const [helperId = ''] = startedIds(toolResults(fake, 1));
    expect(helperFake.requests()).toHaveLength(3);
    expect((await turnState(kernel, helperId)).turn?.outcome).toBe('maxSteps');
    expect(textOf(requestMessages(fake, 2).at(-1))).toMatch(/subagent ended maxSteps\n\nIts last message before it stopped \(unfinished, not a result\):\nstep 3/);
    fake.reply(runs(command('delegate', 'continue', { id: helperId, message: 'Go on.' })), says('Continued.'), says('Read it.'));
    helperFake.reply(runs(command('fs', 'list', {})), runs(command('fs', 'list', {})), says('finished'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go on' });
    await kernel.clock.advance(0);
    await vi.waitFor(() => expect(helperFake.requests()).toHaveLength(6), wait);
    expect((await turnState(kernel, helperId)).turn?.outcome).toBe('done');
  });
});
