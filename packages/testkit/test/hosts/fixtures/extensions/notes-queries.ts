import { z, type Ctx, type Ext } from '@kvman/sdk';
import { codeOfCall, workerState } from './notes-state.ts';

const empty = z.object({});
const note = z.object({ id: z.string(), text: z.string(), tags: z.array(z.string()) });

const misuse: Record<string, (ctx: Ctx) => unknown> = {
  send: (ctx) => ctx.send('counter.increment', {}),
  publish: (ctx) => ctx.publish('notes.added', { id: 'q' }),
  command: (ctx) => ctx.command('counter.increment', {}),
  live: (ctx) => ctx.live('notes.text.streamed', 'q', { text: 'q' }),
  defer: (ctx) => ctx.defer(),
  reply: (ctx) => ctx.reply('01JAZ3K4M5N6P7Q8R9S0T1V2W3', {}),
  step: (ctx) => ctx.step('q', async () => null),
};

export function registerQueries(ext: Ext): void {
  ext.registerQuery('notes.list', {
    description: 'Lists notes.', input: empty, output: z.object({ items: z.array(note) }),
    handle: async (_input, ctx) => ({ items: await ctx.store.collection<z.infer<typeof note>>('notes').find() }),
  });
  ext.registerQuery('notes.writes.list', {
    description: 'Tries to write while listing.', input: empty, output: empty,
    handle: async (_input, ctx) => {
      ctx.store.kv.set('query-write', true);
      return {};
    },
  });
  ext.registerQuery('notes.misuse.get', {
    description: 'Tries something a query cannot do.', input: z.object({ call: z.string() }), output: z.object({ code: z.string() }),
    handle: async ({ call }, ctx) => ({ code: await codeOfCall(() => misuse[call]?.(ctx)) }),
  });
  ext.registerQuery('notes.nested.get', {
    description: 'Queries another query.', input: empty, output: z.object({ total: z.object({ total: z.number() }) }),
    handle: async (_input, ctx) => ({ total: await ctx.query<{ total: number }>('counter.total.get', {}) }),
  });
  ext.registerQuery('notes.setup.count.get', {
    description: 'How often setup ran in this worker.', input: empty, output: z.object({ count: z.number() }),
    handle: async () => ({ count: workerState.setupRuns }),
  });
  ext.registerQuery('notes.late.errors.get', {
    description: 'Codes of calls made after handlers returned.', input: empty, output: z.object({ errors: z.array(z.string()) }),
    handle: async () => ({ errors: workerState.late }),
  });
  ext.registerQuery('notes.slow.get', {
    description: 'Takes a minute.', input: empty, output: empty,
    handle: async () => {
      await new Promise((resolve) => setTimeout(resolve, 60_000));
      return {};
    },
  });
}
