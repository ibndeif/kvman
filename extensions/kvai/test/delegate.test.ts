import { describe, expect, it } from 'vitest';
import type { ProgressChunk } from '@kvman/testkit';
import { entry, harness, useKvai, userSays, type TestExtension } from './support/kvai-kernel.ts';

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

// A delegate provider's commands: `relay.complete` records its input, streams a delta, and answers.
const relay: TestExtension = {
  name: '@test/relay',
  namespace: 'relay',
  entry: entry(`
  const any = z.record(z.string(), z.unknown());
  ctx.registerCommand('relay.complete', { description: 'Answers for relay models.', input: any, output: z.unknown(), public: true,
    handle: async (input) => { await ctx.store.global.kv.set('last', input); ctx.job.progress({ type: 'text', delta: 'via relay' }); return ${JSON.stringify(answer)}; } });
  ctx.registerQuery('relay.last-get', { description: 'Reads the last input.', input: z.object({}), output: z.unknown(), public: true,
    handle: async () => (await ctx.store.global.kv.get('last')) ?? null });
  ctx.registerCommand('relay.hidden', { description: 'A private command.', input: any, output: z.unknown(), handle: () => (${JSON.stringify(answer)}) });
  ctx.registerCommand('relay.down', { description: 'Always fails.', input: any, output: z.unknown(), public: true, handle: () => { throw ctx.problem('relay/DOWN'); } });
  ctx.registerCommand('relay.odd', { description: 'Answers the wrong shape.', input: any, output: z.unknown(), public: true, handle: () => ({ text: 'hello' }) });`),
};

const model = { reasoning: false, input: ['text'], contextWindow: 32_000, maxTokens: 4096 };

describe('delegate providers (07 §7.2, ADR 0009, 57)', () => {
  it('M2.1-H4 a delegate provider forwards the call, streams through, and counts its usage', async () => {
    const { kernel } = await kvai.start({}, [harness, relay]);
    await kernel.exec('kvai.provider.add', { id: 'relay', title: 'Relay', delegate: 'relay.complete' });
    await kernel.exec('kvai.model.add', { provider: 'relay', id: 'r1', name: 'R1', ...model, input: ['text'] });
    const chunks: ProgressChunk[] = [];
    const input = { model: 'relay/r1', messages: [userSays('hi')], thinking: 'low' };
    await expect(kernel.exec('harness.turn', input, { onProgress: (chunk) => chunks.push(chunk) })).resolves.toEqual(answer);
    expect(await kernel.exec('relay.last-get', {})).toEqual(input);
    expect(chunks).toContainEqual({ source: '@test/relay', data: { type: 'text', delta: 'via relay' } });
    expect(await kernel.exec('kvai.usage.get', {})).toEqual([{ model: 'relay/r1', input: 3, output: 4, cacheRead: 1, cacheWrite: 0, cost: 0.25 }]);
  });

  it("M2.1-E21 a failed delegate call fails kvai/PROVIDER_ERROR with the delegate's code", async () => {
    const { kernel } = await kvai.start({}, [harness, relay]);
    const cases = [
      ['gone', 'relay.missing', 'NOT_FOUND'],
      ['hidden', 'relay.hidden', 'NOT_PUBLIC'],
      ['down', 'relay.down', 'relay/DOWN'],
      ['odd', 'relay.odd', 'VALIDATION_FAILED'],
    ] as const;
    for (const [id, command, cause] of cases) {
      await kernel.exec('kvai.provider.add', { id, title: id, delegate: command });
      await kernel.exec('kvai.model.add', { provider: id, id: 'x', name: 'X', ...model, input: ['text'] });
      await expect(kernel.exec('kvai.complete', { model: `${id}/x`, messages: [userSays('hi')] })).rejects.toMatchObject({
        problem: { code: 'kvai/PROVIDER_ERROR', params: { model: `${id}/x`, cause } },
      });
    }
  });

  it('M2.1-E22 a delegate provider needs no key', async () => {
    const { kernel } = await kvai.start({}, [harness, relay]);
    await kernel.exec('kvai.provider.add', { id: 'relay', title: 'Relay', delegate: 'relay.complete' });
    await kernel.exec('kvai.model.add', { provider: 'relay', id: 'r1', name: 'R1', ...model, input: ['text'] });
    expect(await kernel.exec('kvai.provider.list', {})).toContainEqual({ id: 'relay', title: 'Relay', builtIn: false, status: 'noKey', models: 1 });
    await expect(kernel.exec('kvai.complete', { model: 'relay/r1', messages: [userSays('hi')] })).resolves.toMatchObject({ stopReason: 'stop' });
  });
});
