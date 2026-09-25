import { defineExtension, z } from '@kvman/sdk';

const liveSpacingMs = 2;

// The benchmark workloads of ADR 0104: a no-op durable command, an indexed collection, and a live stream.
export default defineExtension({ name: '@acme/bench', namespace: 'bench', title: 'Bench', description: 'Workloads for the benchmarks.' }, (ext) => {
  const docs = ext.registerCollection('docs', {
    description: 'Documents in 100 groups.', schema: z.object({ id: z.string(), group: z.string(), n: z.number().int() }), indexes: [['group']],
  });
  ext.registerEvent('bench.progress.streamed', { description: 'Stamped chunks.', delivery: 'live', chunk: 'data' });

  ext.registerCommand('bench.noop', { description: 'Does nothing, durably.', input: z.object({}), handle: async () => ({}) });
  ext.registerCommand('bench.docs.seed', {
    description: 'Adds documents from a number on.', input: z.object({ from: z.number().int(), count: z.number().int() }),
    handle: async ({ from, count }, ctx) => {
      for (let n = from; n < from + count; n += 1) ctx.store.collection(docs).put({ id: `d${n}`, group: `g${n % 100}`, n });
      return {};
    },
  });
  ext.registerQuery('bench.docs.find', {
    description: 'The documents of one group.', input: z.object({ group: z.string() }), output: z.object({ count: z.number() }),
    handle: async ({ group }, ctx) => ({ count: (await ctx.store.collection(docs).find({ where: { group }, limit: 100 })).length }),
  });
  // Each chunk carries the time it was published; chunks are spaced as a token stream is, not sent as one burst.
  ext.registerCommand('bench.stream', {
    description: 'Streams stamped chunks.', input: z.object({ key: z.string(), count: z.number().int() }), timeoutMs: 120_000,
    handle: async ({ key, count }, ctx) => {
      for (let index = 0; index < count; index += 1) {
        ctx.live('bench.progress.streamed', key, { data: { index, at: performance.timeOrigin + performance.now() } });
        await new Promise((resolve) => setTimeout(resolve, liveSpacingMs));
      }
      return {};
    },
  });
});
