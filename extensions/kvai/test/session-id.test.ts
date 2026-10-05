import { describe, expect, it } from 'vitest';
import { entry, harness, useKvai, userSays, type TestExtension } from './support/kvai-kernel.ts';
import { streamOptions } from '../src/complete/stream-options.ts';

const kvai = useKvai();

const answer = {
  message: {
    role: 'assistant',
    content: [{ type: 'text', text: 'via relay' }],
    api: 'relay',
    provider: 'relay',
    model: 'r1',
    usage: { input: 3, output: 4, cacheRead: 1, cacheWrite: 0, totalTokens: 8, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0.25 } },
    stopReason: 'stop',
    timestamp: 5,
  },
  stopReason: 'stop',
  usage: { input: 3, output: 4, cacheRead: 1, cacheWrite: 0, cost: 0.25 },
};

// A delegate provider whose command records its input.
const relay: TestExtension = {
  name: '@test/relay',
  namespace: 'relay',
  entry: entry(`
  const any = z.record(z.string(), z.unknown());
  ctx.registerCommand('relay.complete', { description: 'Answers for relay models.', input: any, output: z.unknown(), public: true,
    handle: async (input) => { await ctx.store.global.kv.set('last', input); return ${JSON.stringify(answer)}; } });
  ctx.registerQuery('relay.last-get', { description: 'Reads the last input.', input: z.object({}), output: z.unknown(), public: true,
    handle: async () => (await ctx.store.global.kv.get('last')) ?? null });`),
};

const model = { reasoning: false, input: ['text'] as ('text' | 'image')[], contextWindow: 32_000, maxTokens: 4096 };

async function relayWorld() {
  const world = await kvai.start({}, [harness, relay]);
  await world.kernel.exec('kvai.provider.add', { id: 'relay', title: 'Relay', delegate: 'relay.complete' });
  await world.kernel.exec('kvai.model.add', { provider: 'relay', id: 'r1', name: 'R1', ...model });
  return world;
}

describe('sessionId (ADR 0012, 6)', () => {
  it("QA19-H8 `kvai.complete` passes `sessionId` on", async () => {
    const { kernel } = await relayWorld();
    await kernel.exec('kvai.complete', { model: 'relay/r1', messages: [userSays('hi')], sessionId: 'chat-1' });
    expect(await kernel.exec('relay.last-get', {})).toMatchObject({ sessionId: 'chat-1' });
    const options = streamOptions(new AbortController().signal, { messages: [userSays('hi')], sessionId: 'chat-1' }, undefined);
    expect(options).toMatchObject({ sessionId: 'chat-1' });
  });

  it('QA19-E1 `sessionId` left out', async () => {
    const { kernel } = await relayWorld();
    await kernel.exec('kvai.complete', { model: 'relay/r1', messages: [userSays('hi')] });
    const last: unknown = await kernel.exec('relay.last-get', {});
    expect(last).not.toHaveProperty('sessionId');
    const options = streamOptions(new AbortController().signal, { messages: [userSays('hi')] }, undefined);
    expect(options).not.toHaveProperty('sessionId');
  });

  it('QA19-E2 An empty `sessionId`', async () => {
    const { kernel, fake } = await kvai.start();
    await expect(kernel.exec('kvai.complete', { model: 'fake/m1', messages: [userSays('hi')], sessionId: '' })).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
    expect(fake.requests()).toHaveLength(0);
  });
});
