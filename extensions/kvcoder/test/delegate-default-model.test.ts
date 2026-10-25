import { describe, expect, it } from 'vitest';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, runs, says, shell } from './support/model-script.ts';
import { newSession, turnState } from './support/turns.ts';
import { worker, workers } from './support/workers.ts';

const kvcoder = useKvcoder();
const delegate = (name: string) => command('delegate', 'run', { worker: name, title: 'Helper', task: 'Look' });
const modelsOf = (fake: Awaited<ReturnType<typeof kvcoder.start>>['fake']): string[] => fake.requests().map((request) => (request.body as { model: string }).model);

describe('the model a helper uses when its worker names none (08 §8.5, ADR 0069, 3)', { timeout: 30_000 }, () => {
  it("M2.4-E246 the setting gives a helper its model, a worker's own model wins, and with none the chat's model is used", async () => {
    const lists = workers(worker('plain'), worker('own', { model: 'fake/m1' }));
    const set = await kvcoder.start({ settings: { ...lists, 'kvcoder.delegate.model': 'fake/m2' } });
    set.fake.reply(runs(delegate('plain')), says('one'), runs(delegate('own')), says('two'), says('done'));
    await set.kernel.exec('kvcoder.message.send', { sessionId: await newSession(set.kernel), text: 'go' });
    await set.kernel.clock.advance(0);
    expect(modelsOf(set.fake)).toEqual(['m1', 'm2', 'm1', 'm1', 'm1']);

    const unset = await kvcoder.start({ settings: lists });
    unset.fake.reply(runs(delegate('plain')), says('one'), says('done'));
    await unset.kernel.exec('kvcoder.message.send', { sessionId: await newSession(unset.kernel), text: 'go' });
    await unset.kernel.clock.advance(0);
    expect(modelsOf(unset.fake)).toEqual(['m1', 'm1', 'm1']);
  });

});

describe("a helper's thinking when its worker names none (08 §8.5, ADR 0102, 3)", { timeout: 30_000 }, () => {
  // The levels of the helpers the chat's turn waits on, in the order it started them.
  async function helperLevels(settings: Record<string, unknown>, ...names: string[]): Promise<string[]> {
    const world = await kvcoder.start({ settings: settings as never });
    await world.kernel.exec('kvai.model.add', { provider: 'fake', id: 'plain', name: 'Plain', input: ['text'], reasoning: false, contextWindow: 128_000, maxTokens: 8192 });
    const sessionId = await newSession(world.kernel);
    await world.kernel.exec('kvcoder.session.configure', { sessionId, thinking: 'high' });
    world.fake.reply(runs(...names.map((name) => delegate(name))), ...names.map(() => runs(shell('true', { risky: true }))));
    await world.kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await world.kernel.clock.advance(0);
    const pending = (await turnState(world.kernel, sessionId)).turn?.pending ?? [];
    const children = await Promise.all(pending.map((item) => world.kernel.exec('kvcoder.session.get', { sessionId: String(item.childSessionId) })));
    return children.map((child) => child.thinking);
  }

  it('QA67-H7 a helper thinks at medium in a chat set higher, and at the level the setting names', async () => {
    expect(await helperLevels(workers(worker('plain-worker')), 'plain-worker')).toEqual(['medium']);
    expect(await helperLevels({ ...workers(worker('plain-worker')), 'kvcoder.delegate.thinking': 'low' }, 'plain-worker')).toEqual(['low']);
  });

  it("QA67-E6 and QA67-E7 a worker's own level wins, and a model that doesn't think is off", async () => {
    expect(await helperLevels(workers(worker('own', { thinking: 'high' }), worker('flat', { model: 'fake/plain' })), 'own', 'flat')).toEqual(['high', 'off']);
  });
});
