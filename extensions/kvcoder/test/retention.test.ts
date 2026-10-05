import { describe, expect, it } from 'vitest';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { command, runs } from './support/model-script.ts';
import { newSession } from './support/turns.ts';

const kvcoder = useKvcoder();

const day = 24 * 3_600_000;

describe('retention (08 §8.1, ADR 0009, 103)', { timeout: 30_000 }, () => {
  it('M2.4-E51 the daily prune deletes the oldest idle top-level sessions beyond kvcoder.sessions.keep, never a waiting one', async () => {
    const { kernel, fake } = await kvcoder.start({ settings: { 'kvcoder.sessions.keep': 2 } });
    const oldest = await newSession(kernel);
    const waiting = await newSession(kernel);
    fake.reply(runs(command('ask', 'text', {"prompt":"?"})));
    await kernel.exec('kvcoder.message.send', { sessionId: waiting, text: 'go' });
    await kernel.clock.advance(0);
    const newer = [await newSession(kernel), await newSession(kernel)];
    await kernel.clock.advance(day);
    expect((await kernel.exec('kvcoder.session.list', { limit: 10 })).map((session) => session.id)).toEqual([newer[1], newer[0], waiting]);
    await expect(kernel.exec('kvcoder.session.get', { sessionId: oldest })).rejects.toMatchObject({ problem: { code: 'kvcoder/SESSION_NOT_FOUND' } });
  });

  it('M2.4-E51 with kvcoder.sessions.keep 0 the prune deletes nothing', async () => {
    const { kernel } = await kvcoder.start();
    for (let index = 0; index < 3; index += 1) await newSession(kernel);
    await kernel.clock.advance(day);
    expect(await kernel.exec('kvcoder.session.list', { limit: 10 })).toHaveLength(3);
  });
});
