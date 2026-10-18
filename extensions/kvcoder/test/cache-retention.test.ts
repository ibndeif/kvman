import { describe, expect, it, vi } from 'vitest';
import { z } from '@kvman/sdk';
import { useKvcoder, type FixtureExtension } from './support/kvcoder-kernel.ts';
import { padded } from './support/long-messages.ts';
import { turnState } from './support/turns.ts';
import { wait } from './support/wait.ts';

// ADR 0087, 4: a chat's steps and summaries ask for the long prompt cache; a helper's steps and a title don't. The
// provider `relay` is a delegate command that records each `kvai.complete` input and answers by what the call is.

const kvcoder = useKvcoder();

const relay: FixtureExtension = {
  name: '@test/relay',
  namespace: 'relay',
  entry: `import { z, type Ctx } from '@kvman/sdk';
const usage = { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
const reply = (content, stopReason) => ({ message: { role: 'assistant', content, api: 'relay', provider: 'relay', model: 'r1', usage, stopReason, timestamp: 1 }, stopReason, usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, cost: 0 } });
const delegate = { type: 'toolCall', id: 'c1', name: 'run', arguments: { connector: 'delegate', command: 'run', payload: { worker: 'general', title: 'Helper', task: 'Do it' } } };
const kindOf = (input) => {
  const last = JSON.stringify(input.messages.at(-1) ?? {});
  if (input.maxTokens === 30) return 'title';
  if (last.includes('Summarize the conversation above')) return 'summary';
  if (String(input.systemPrompt).includes('the lead agent gave you')) return 'helper';
  return input.messages.some((message) => message.role === 'toolResult') ? 'lead-after' : 'lead';
};
export default (ctx: Ctx): void => {
  const any = z.record(z.string(), z.unknown());
  ctx.registerCommand('relay.complete', { description: 'Answers for relay models.', input: any, output: z.unknown(), public: true,
    handle: async (input) => {
      const kind = kindOf(input);
      const seen = (await ctx.store.global.kv.get('seen')) ?? [];
      await ctx.store.global.kv.set('seen', [...seen, { kind, retention: input.cacheRetention ?? null }]);
      return kind === 'lead' ? reply([delegate], 'toolUse') : reply([{ type: 'text', text: kind === 'title' ? 'Title' : 'Done.' }], 'stop');
    } });
  ctx.registerQuery('relay.seen-list', { description: 'Lists the calls seen.', input: z.object({}), output: z.unknown(), public: true,
    handle: async () => (await ctx.store.global.kv.get('seen')) ?? [] });
};
`,
};

const seenSchema = z.array(z.object({ kind: z.string(), retention: z.string().nullable() }));

describe('the long prompt cache for the lead (ADR 0087, 4)', { timeout: 30_000 }, () => {
  it('QA55-H6 a chat step and its summary send long; a helper step and a title send none', async () => {
    const { kernel } = await kvcoder.start({ extensions: [relay], settings: { 'kvcoder.compactKeep': 1 } });
    await kernel.exec('kvai.provider.add', { id: 'relay', title: 'Relay', delegate: 'relay.complete' });
    await kernel.exec('kvai.model.add', { provider: 'relay', id: 'r1', name: 'R1', reasoning: false, input: ['text'], contextWindow: 1000, maxTokens: 100 });
    // A chat with no title gets one written after its first turn.
    const sessionId = (await kernel.exec('kvcoder.session.create', {})).id;
    await kernel.exec('kvcoder.session.configure', { sessionId, model: 'relay/r1' });
    await kernel.exec('kvcoder.message.send', { sessionId, text: padded('go', 2000) });
    const seen = async () => seenSchema.parse(await kernel.exec('relay.seen-list', {}));
    await vi.waitFor(async () => {
      await kernel.clock.advance(0);
      expect((await seen()).map((call) => call.kind)).toContain('title');
    }, wait);
    expect((await turnState(kernel, sessionId)).turn).toMatchObject({ outcome: 'done' });
    expect(await kernel.exec('kvcoder.session.compact', { sessionId })).toEqual({ summarized: true });
    const byKind = Object.fromEntries((await seen()).map((call) => [call.kind, call.retention]));
    expect(byKind).toEqual({ lead: 'long', helper: null, 'lead-after': 'long', title: null, summary: 'long' });
  });
});
