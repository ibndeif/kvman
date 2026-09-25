import { defineExtension, z } from '@kvman/sdk';

// A small counter the notes fixture calls: results, registered problems, retries, and deferral.
export default defineExtension({ name: '@acme/counter', namespace: 'counter', title: 'Counter', description: 'Counts for the host tests.' }, (ext) => {
  ext.registerError('counter/NEGATIVE', { description: 'Below zero.', title: 'The count cannot go below zero', hint: 'send a positive number' });
  ext.registerError('counter/BUSY', { description: 'Busy for now.', title: 'The counter is busy', retryable: true });
  ext.registerEvent('counter.progress.updated', { description: 'Progress of a count.', delivery: 'live', chunk: 'value' });

  ext.registerCommand('counter.increment', {
    description: 'Adds to the total.', input: z.object({ by: z.number().int().default(1) }), output: z.object({ total: z.number() }),
    handle: async ({ by }, ctx) => {
      const total = ((await ctx.store.kv.get<number>('total')) ?? 0) + by;
      ctx.store.kv.set('total', total);
      return { total };
    },
  });
  ext.registerCommand('counter.fail', {
    description: 'Always fails with a registered problem.', input: z.object({}),
    handle: async (_input, ctx) => {
      throw ctx.problem('counter/NEGATIVE', { params: { by: -1 }, detail: 'below zero' });
    },
  });
  ext.registerCommand('counter.flaky', {
    description: 'Fails once with a retryable problem.', input: z.object({}),
    handle: async (_input, ctx) => {
      let first = false;
      await ctx.step('first', async () => {
        first = true;
        return null;
      });
      if (first) throw ctx.problem('counter/BUSY');
      return { ok: true };
    },
  });
  ext.registerCommand('counter.unknown.code', {
    description: 'Throws a code it never registered.', input: z.object({}),
    handle: async (_input, ctx) => {
      throw ctx.problem('counter/UNKNOWN');
    },
  });
  ext.registerCommand('counter.broken', {
    description: 'Throws an unexpected error.', input: z.object({}),
    handle: async () => {
      throw new TypeError('boom');
    },
  });
  ext.registerCommand('counter.wait', { description: 'Waits for a reply.', input: z.object({}), handle: async (_input, ctx) => ctx.defer() });
  ext.registerCommand('counter.secret', { description: 'Internal.', input: z.object({}), access: 'internal', handle: async () => ({}) });
  ext.registerCommand('counter.reset', { description: 'Internal reset.', input: z.object({}), access: 'internal', handle: async () => ({}) });
  ext.registerQuery('counter.total.get', {
    description: 'The total.', input: z.object({}), output: z.object({ total: z.number() }),
    handle: async (_input, ctx) => ({ total: (await ctx.store.kv.get<number>('total')) ?? 0 }),
  });
});
