import { describe, expect, it } from 'vitest';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, runs, says } from './support/model-script.ts';
import { newSession } from './support/turns.ts';
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
