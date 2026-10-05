import { describe, expect, it, vi } from 'vitest';
import type { FixtureExtension } from './support/kvcoder-kernel.ts';
import { heldReply } from './support/held-reply.ts';
import { wait } from './support/wait.ts';
import { useKvcoder } from './support/kvcoder-kernel.ts';
import { longAlone, padded } from './support/long-messages.ts';
import { command, runs, says } from './support/model-script.ts';
import { newSession, turnState } from './support/turns.ts';

const kvcoder = useKvcoder();

// A delegate provider whose command records `{ sessionId, systemPrompt }` of every input, then answers through
// kvai's usual model so the scripted fake replies keep working.
const relayEntry = `import { z, type Ctx } from '@kvman/sdk';

export default (ctx: Ctx): void => {
  const calls = () => ctx.store.collection('calls', z.object({ sessionId: z.string().nullable(), systemPrompt: z.string().nullable() }));
  ctx.registerCommand('relay.complete', { description: 'Records the call, then answers through kvai.', input: z.record(z.string(), z.unknown()), output: z.unknown(), public: true,
    handle: async (input) => {
      await calls().insert({ sessionId: typeof input.sessionId === 'string' ? input.sessionId : null, systemPrompt: typeof input.systemPrompt === 'string' ? input.systemPrompt : null });
      return await ctx.exec('kvai.complete', { ...input, model: 'fake/m1' });
    } });
  ctx.registerQuery('relay.calls.list', { description: 'Lists the recorded calls.', input: z.object({}), output: z.array(z.object({ sessionId: z.string().nullable(), systemPrompt: z.string().nullable() })), public: true,
    handle: async () => (await calls().find({}, { limit: 100 })).map((call) => ({ sessionId: call.sessionId, systemPrompt: call.systemPrompt })) });
};
`;

const relay: FixtureExtension = { name: '@test/relay', namespace: 'relay', entry: relayEntry, dependencies: { '@kvman/kvai': '^0.1.0' } };

describe('model session id (ADR 0012, 6)', { timeout: 30_000 }, () => {
  async function relaySession() {
    const world = await kvcoder.start({ settings: { 'kvcoder.model': 'relay/r1' }, extensions: [relay] });
    await world.kernel.exec('kvai.provider.add', { id: 'relay', title: 'Relay', delegate: 'relay.complete' });
    await world.kernel.exec('kvai.model.add', { provider: 'relay', id: 'r1', name: 'R1', reasoning: false, input: ['text'], contextWindow: 128_000, maxTokens: 8192 });
    return world;
  }

  it("QA19-H9 kvcoder sends the chat's id", async () => {
    const { kernel, fake } = await relaySession();
    const sessionId = (await kernel.exec('kvcoder.session.create', {})).id;
    fake.reply(says('Sure.'), says('"Date Chat"'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: padded('hello', longAlone) });
    await kernel.clock.advance(0);
    // A compaction summarizes what is older than the last 10 messages, so the chat needs more than 10, and the older ones long enough (ADR 0019, 7).
    for (const index of [2, 3, 4, 5, 6]) {
      fake.reply(says(`answer ${index}`));
      await kernel.exec('kvcoder.message.send', { sessionId, text: `message ${index}` });
      await kernel.clock.advance(0);
    }
    fake.reply(says('SUMMARY'));
    await kernel.exec('kvcoder.session.compact', { sessionId });
    const calls = (await kernel.exec('relay.calls.list', {})) as { sessionId: string | null; systemPrompt: string | null }[];
    const kinds = ['You are kvman Coder', 'Write a title of 3 to 6 words', 'Summarize the conversation below'].map((start) => calls.filter((call) => call.systemPrompt?.startsWith(start) === true).length);
    expect(kinds).toEqual([6, 1, 1]);
    expect(calls.map((call) => call.sessionId)).toEqual(Array.from({ length: 8 }, () => sessionId));
  });

  it("QA19-E3 A subagent's calls carry the child's id", async () => {
    const { kernel, fake } = await relaySession();
    const sessionId = await newSession(kernel);
    const child = heldReply({ text: 'child done' });
    fake.reply(runs(command('delegate', 'run', { worker: 'general', task: 'Check it' })), child.reply, says('parent done'));
    await kernel.exec('kvcoder.message.send', { sessionId, text: 'go' });
    await vi.waitFor(() => expect(fake.requests()).toHaveLength(2), wait);
    const parent = await turnState(kernel, sessionId);
    const childId = String(parent.turn?.pending[0]?.childSessionId);
    expect(childId).not.toBe(sessionId);
    const during = (await kernel.exec('relay.calls.list', {})) as { sessionId: string | null; systemPrompt: string | null }[];
    expect(during.map((call) => call.sessionId)).toEqual([sessionId, childId]);
    child.release();
    await kernel.clock.advance(0);
    const calls = (await kernel.exec('relay.calls.list', {})) as { sessionId: string | null; systemPrompt: string | null }[];
    expect(new Set(calls.map((call) => call.sessionId))).toEqual(new Set([sessionId, childId]));
    expect(calls.filter((call) => call.sessionId === childId)).toHaveLength(1);
  });
});
