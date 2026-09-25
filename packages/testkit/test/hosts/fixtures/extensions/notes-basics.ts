import { z, type Ext } from '@kvman/sdk';
import { firstRun, workerState } from './notes-state.ts';

const empty = z.object({});

export function registerBasics(ext: Ext): void {
  ext.registerCommand('notes.add', {
    description: 'Adds a note.',
    input: z.object({ text: z.string().refine((text) => text !== 'forbidden', 'this text is not allowed'), tags: z.array(z.string()).default([]) }),
    output: z.object({ id: z.string() }),
    handle: async ({ text, tags }, ctx) => {
      const id = ctx.ids.new();
      ctx.store.collection('notes').put({ id, text, tags });
      ctx.publish('notes.added', { id });
      return { id };
    },
  });
  ext.registerCommand('notes.touch', {
    description: 'Touches a note.', input: z.object({ id: z.string(), step: z.number() }),
    handle: async (input, ctx) => {
      ctx.publish('notes.touched', input);
      return {};
    },
  });
  ext.registerCommand('notes.broken', {
    description: 'Returns a result its output schema rejects.', input: empty, output: z.object({ id: z.string().min(5) }),
    handle: async (_input, ctx) => {
      ctx.store.collection('notes').put({ id: 'broken', text: 'x', tags: [] });
      return { id: 'x' };
    },
  });
  ext.registerCommand('notes.unknown.send', {
    description: 'Writes, then sends an unknown type.', input: empty,
    handle: async (_input, ctx) => {
      ctx.store.collection('notes').put({ id: 'unsent', text: 'x', tags: [] });
      ctx.send('counter.nothing', {});
      return {};
    },
  });
  ext.registerCommand('notes.describe', {
    description: 'Describes its invocation.', input: empty,
    handle: async (_input, ctx) => ({
      message: { id: ctx.message.id, type: ctx.message.type, source: ctx.message.source }, context: { ...ctx.context }, workspace: ctx.workspace ?? null,
    }),
  });
  ext.registerCommand('notes.describe.nested', {
    description: 'Describes a call with added context.', input: empty,
    handle: async (_input, ctx) => ctx.command('notes.describe', {}, { context: { sessionId: 's1' } }),
  });
  ext.registerCommand('notes.global.describe', {
    description: 'Describes a global invocation.', input: empty, scope: 'global', handle: async (_input, ctx) => ({ workspace: ctx.workspace ?? null }),
  });
  ext.registerCommand('notes.log', {
    description: 'Logs.', input: empty,
    handle: async (_input, ctx) => {
      ctx.log.info('fetched', { url: 'https://u:p@h/x', apiKey: 'k', nested: { password: 'p' }, count: 2 });
      ctx.log.warn('Bearer abc');
      return {};
    },
  });
  ext.registerCommand('notes.stamp', {
    description: 'Takes ids and times, then fails its first attempt.', input: empty,
    handle: async (_input, ctx) => {
      const ids = [ctx.ids.new(), ctx.ids.new()];
      const times = [ctx.now(), ctx.now()];
      let first = false;
      await ctx.step('record', async () => {
        first = true;
        return { ids, times };
      });
      if (first) throw ctx.problem('notes/RETRY_ME');
      return { ids, times };
    },
  });
  ext.registerCommand('notes.fetch', {
    description: 'Fetches once in a step, then fails its first attempt.', input: empty,
    handle: async (_input, ctx) => {
      let ran = false;
      const result = await ctx.step('fetch', async () => {
        ran = true;
        workerState.fetchRuns += 1;
        return { body: 'fetched' };
      });
      if (ran) throw ctx.problem('notes/RETRY_ME');
      return { result, runs: workerState.fetchRuns };
    },
  });
  ext.registerCommand('notes.fetch.hang', {
    description: 'Begins a step whose effect ends the worker.', input: empty,
    handle: async (_input, ctx) => {
      await ctx.step('hang', async () => process.exit(1));
      return {};
    },
  });
  ext.registerCommand('notes.values.order', {
    description: 'Takes an id, then begins a step that ends the worker.', input: empty,
    handle: async (_input, ctx) => {
      ctx.ids.new();
      await ctx.step('probe', async () => process.exit(1));
      return {};
    },
  });
  ext.registerCommand('notes.values.call', {
    description: 'Takes a time, then waits for a command that never replies.', input: empty,
    handle: async (_input, ctx) => {
      ctx.now();
      return ctx.command('counter.wait', {});
    },
  });
  ext.registerCommand('notes.crash.once', {
    description: 'Ends its worker or waits on its first attempt.', input: z.object({ mode: z.enum(['exit', 'wait']) }),
    handle: async ({ mode }, ctx) => {
      if (await firstRun(ctx, 'first')) {
        if (mode === 'exit') process.exit(1);
        await new Promise((resolve) => setTimeout(resolve, 60_000));
      }
      return { mode };
    },
  });
}
