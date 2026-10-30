import { describe, expect, it, vi } from 'vitest';
import type { TestKernel } from '@kvman/testkit';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { shippedWorkers } from '../src/delegate/workers.ts';
import { command, runs, says, systemPrompt, toolResults } from './support/model-script.ts';
import { newSession } from './support/turns.ts';
import { wait } from './support/wait.ts';
import { brief, worker, workers } from './support/workers.ts';

// A helper's model and thinking (08 §8.5, ADR 0069, 3; ADR 0102, 3; ADR 0108, 3). Helpers run in the background, so each
// test reads the helpers it started from the ids their calls returned.

const kvcoder = useKvcoder();
const delegate = (name: string) => command('delegate', 'run', brief(name));
const startedIds = (results: readonly string[]): string[] => results.flatMap((text) => /^started (\S+)/.exec(text)?.[1] ?? []);

// Starts one helper of each worker in one reply, and gives each helper's session as kvcoder keeps it.
async function helpers(settings: Record<string, unknown>, names: readonly string[], prepare: (kernel: TestKernel) => Promise<void> = async () => undefined) {
  const world = await kvcoder.start({ settings: settings as never });
  await world.kernel.exec('kvai.model.add', { provider: 'helper', id: 'm2', name: 'Helper M2', input: ['text'], reasoning: true, contextWindow: 128_000, maxTokens: 8192 });
  await world.kernel.exec('kvai.model.add', { provider: 'helper', id: 'plain', name: 'Plain', input: ['text'], reasoning: false, contextWindow: 128_000, maxTokens: 8192 });
  await prepare(world.kernel);
  const sessionId = await newSession(world.kernel);
  await world.kernel.exec('kvcoder.session.configure', { sessionId, thinking: 'high' });
  world.fake.reply(runs(...names.map(delegate)), says('started them'), ...names.map(() => says('read the answer')));
  world.helperFake.reply(...names.map(() => says('the answer')));
  await world.kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
  await world.kernel.clock.advance(0);
  const ids = startedIds(toolResults(world.fake, 1));
  const sessions = await Promise.all(ids.map((id) => world.kernel.exec('kvcoder.session.get', { sessionId: id })));
  return { ...world, sessionId, sessions };
}

describe('the model a helper uses when its worker names none (08 §8.5, ADR 0069, 3)', { timeout: 30_000 }, () => {
  it("M2.4-E246 the setting gives a helper its model, and a worker's own model wins", async () => {
    const { sessions } = await helpers({ ...workers(worker('plain'), worker('own', { model: 'helper/m1' })), 'kvcoder.delegate.model': 'helper/m2' }, ['plain', 'own']);
    expect(sessions.map((session) => session.model)).toEqual(['helper/m2', 'helper/m1']);
  });

  it("M2.4-E246 with no setting a helper uses the chat's model", async () => {
    const { kernel, helperFake } = await kvcoder.start({ settings: { ...workers(worker('plain')), 'kvcoder.delegate.model': null } });
    const sessionId = await newSession(kernel);
    await kernel.exec('kvcoder.session.configure', { sessionId, model: 'helper/m1' });
    // The lead and its helper share one model here, so every reply is the same: whichever asks first gets one.
    helperFake.reply(runs(delegate('plain')), ...Array.from({ length: 4 }, () => says('done')));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await kernel.clock.advance(0);
    const [helper] = (await kernel.exec('kvcoder.job.list', { sessionId })).filter((job) => job.kind === 'subagent');
    expect((await kernel.exec('kvcoder.session.get', { sessionId: helper?.id ?? 'none' })).model).toBe('helper/m1');
  });
});

describe("a helper's thinking (08 §8.5, ADR 0102, 3; ADR 0108, 3)", { timeout: 30_000 }, () => {
  const levels = async (settings: Record<string, unknown>, ...names: string[]): Promise<string[]> => (await helpers(settings, names)).sessions.map((session) => session.thinking);

  it('QA67-H7 a helper thinks at medium in a chat set higher, and at the level the setting names', async () => {
    expect(await levels(workers(worker('plain-worker')), 'plain-worker')).toEqual(['medium']);
    expect(await levels({ ...workers(worker('plain-worker')), 'kvcoder.delegate.thinking': 'low' }, 'plain-worker')).toEqual(['low']);
  });

  it('QA68-H4 the shipped council thinks at high, with its instructions and read-only', async () => {
    const { helperFake, sessions } = await helpers({}, ['council']);
    expect(sessions.map((session) => session.thinking)).toEqual(['high']);
    await vi.waitFor(() => expect(helperFake.requests().length).toBeGreaterThan(0), wait);
    const council = shippedWorkers.find((entry) => entry.name === 'council');
    expect(systemPrompt(helperFake, 0)).toContain(`## Worker: council\n${council?.instructions ?? 'none'}\n\nYou are read-only here: `);
  });

  it("QA67-E6 and QA67-E7 a worker's own level wins, and a model that doesn't think is off", async () => {
    expect(await levels(workers(worker('own', { thinking: 'high' }), worker('flat', { model: 'helper/plain' })), 'own', 'flat')).toEqual(['high', 'off']);
  });

  it('QA71-H11 every helper is capped at kvcoder.delegate.thinkingLimit, high by default', async () => {
    expect(await levels(workers(worker('deep', { thinking: 'max' }), worker('deeper', { thinking: 'xhigh' })), 'deep', 'deeper')).toEqual(['high', 'high']);
    expect(await levels({ ...workers(worker('deep', { thinking: 'max' })), 'kvcoder.delegate.thinkingLimit': 'medium' }, 'deep')).toEqual(['medium']);
  });

  it('QA71-E11 a capped level is then the nearest one the model has', async () => {
    // A test model thinks from off to high, so max capped at xhigh becomes high.
    expect(await levels({ ...workers(worker('deep', { thinking: 'max' })), 'kvcoder.delegate.thinkingLimit': 'xhigh' }, 'deep')).toEqual(['high']);
  });
});
