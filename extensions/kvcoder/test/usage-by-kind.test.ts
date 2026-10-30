import { describe, expect, it } from 'vitest';
import type { FakeReply } from '@kvman/testkit/fake-openai';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { padded } from './support/long-messages.ts';
import { command, runs } from './support/model-script.ts';
import { newSession, turnState } from './support/turns.ts';
import { delegated } from './support/helpers.ts';

const kvcoder = useKvcoder();
const costing = (text: string, input: number, output: number): FakeReply => ({ chunks: [{ text }], usage: { input, output } });
const tokens = (usage: { input: number; output: number } | undefined) => [usage?.input, usage?.output];

describe("what a chat's helper calls cost (KVC-16, ADR 0058)", { timeout: 30_000 }, () => {
  it('M2.4-E183 a summary by hand is in the chat usage and in usageBy.summary', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = await newSession(kernel);
    for (const index of [1, 2, 3, 4, 5, 6, 7]) {
      fake.reply(costing(`answer ${String(index)}`, 100, 10));
      await kernel.exec('kvcoder.message.send', { sessionId, text: padded(`message ${String(index)}`) });
      await kernel.clock.advance(0);
    }
    const before = (await kernel.exec('kvcoder.session.get', { sessionId })).usage;
    expect(await kernel.exec('kvcoder.session.get', { sessionId })).not.toHaveProperty('usageBy');
    fake.reply(costing('SUMMARY', 1234, 56));
    expect(await kernel.exec('kvcoder.session.compact', { sessionId })).toEqual({ summarized: true });
    const after = await kernel.exec('kvcoder.session.get', { sessionId });
    expect(tokens(after.usage)).toEqual([before.input + 1234, before.output + 56]);
    expect(tokens(after.usageBy?.summary)).toEqual([1234, 56]);
    expect(tokens(after.usageBy?.title)).toEqual([0, 0]);
  });

  it('M2.4-E183 a summary made during a turn is in that turn, and the title call is in usageBy.title', async () => {
    const { kernel, fake } = await kvcoder.start();
    const sessionId = (await kernel.exec('kvcoder.session.create', {})).id;
    fake.reply(costing('answer 1', 100, 10), costing('A short title', 40, 4));
    await kernel.exec('kvcoder.message.send', { sessionId, text: padded('message 1') });
    await kernel.clock.advance(0);
    const titled = await kernel.exec('kvcoder.session.get', { sessionId });
    expect(titled.title).toBe('A short title');
    expect(tokens(titled.usageBy?.title)).toEqual([40, 4]);
    expect(tokens(titled.usage)).toEqual([140, 14]);
    for (const index of [2, 3, 4, 5, 6, 7]) {
      fake.reply(costing(`answer ${String(index)}`, 100, 10));
      await kernel.exec('kvcoder.message.send', { sessionId, text: padded(`message ${String(index)}`) });
      await kernel.clock.advance(0);
    }
    await kernel.exec('kernel.settings.set', { key: 'kvcoder.compactAt', value: 0.0001, scope: 'global' });
    fake.reply(costing('SUMMARY', 500, 50), costing('answer 8', 100, 10));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'message 8' });
    await kernel.clock.advance(0);
    const { session, turn } = await turnState(kernel, sessionId);
    expect(tokens(turn?.usage)).toEqual([600, 60]);
    expect(tokens(session.usageBy?.summary)).toEqual([500, 50]);
    expect(tokens(session.usage)).toEqual([40 + 7 * 100 + 600, 4 + 7 * 10 + 60]);
  });

  it("M2.4-E183 a helper's usage is in its parent once, and in usageBy.helpers", async () => {
    const world = await kvcoder.start();
    const sessionId = await newSession(world.kernel);
    await delegated(world, sessionId, [{ ...runs(command('delegate', 'run', { worker: 'general', title: 'Helper', kind: 'find', goal: 'Go', done: 'It is done.' })), usage: { input: 100, output: 10 } }, costing('Started.', 100, 10), costing('parent done', 100, 10)], [costing('child done', 300, 30)]);
    const session = await world.kernel.exec('kvcoder.session.get', { sessionId });
    expect(tokens(session.usage)).toEqual([600, 60]);
    expect(tokens(session.usageBy?.helpers)).toEqual([300, 30]);
  });
});
