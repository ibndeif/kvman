import { z, type Ctx, type Ext } from '@kvman/sdk';
import { codeOf, codeOfCall, workerState } from './notes-state.ts';

const empty = z.object({});

function aborted(ctx: Ctx): Promise<void> {
  return new Promise((resolve) => {
    if (ctx.signal.aborted) resolve();
    ctx.signal.addEventListener('abort', () => resolve());
  });
}

export function registerSupervision(ext: Ext): void {
  ext.registerCommand('notes.cascade', {
    description: 'Waits on a deferred command of its own and on one of the counter.', input: empty,
    handle: async (_input, ctx) => Promise.all([ctx.command('notes.ask', { id: 'cascade' }), ctx.command('counter.wait', {})]),
  });
  ext.registerCommand('notes.cancel.probe', {
    description: 'Streams, writes, and waits for its signal, then records what ctx does after it.', input: empty,
    handle: async (_input, ctx) => {
      ctx.live('notes.text.streamed', 'probe', { text: 'partial' });
      ctx.store.collection('notes').put({ id: 'probe', text: 'x', tags: [] });
      await aborted(ctx);
      workerState.probe = [
        codeOf(ctx.signal.reason), await codeOfCall(() => ctx.send('counter.increment', {})), await codeOfCall(() => ctx.command('counter.increment', {})),
      ];
      return {};
    },
  });
  ext.registerCommand('notes.edit.slow', {
    description: 'Holds its lane until its signal fires.', input: z.object({ id: z.string() }), lane: 'note:{{ $payload.id }}',
    handle: async (_input, ctx) => {
      await aborted(ctx);
      return {};
    },
  });
  ext.registerCommand('notes.deadlines.check', {
    description: 'Sends and calls commands to show which inherit its deadline.', input: empty,
    handle: async (_input, ctx) => {
      ctx.send('counter.increment', {});
      await ctx.command('counter.increment', {});
      await ctx.command('counter.increment', {}, { deadlineAt: ctx.deadlineAt + 10_000 });
      return { deadlineAt: ctx.deadlineAt };
    },
  });
  ext.registerCommand('notes.describe.deadline', {
    description: 'Reports its invocation deadline.', input: empty, handle: async (_input, ctx) => ({ deadlineAt: ctx.deadlineAt }),
  });
  ext.registerCommand('notes.nest', {
    description: 'Calls itself n levels deep.', input: z.object({ n: z.number().int() }),
    handle: async ({ n }, ctx) => {
      if (n > 0) await ctx.command('notes.nest', { n: n - 1 });
      return { n };
    },
  });
  ext.registerCommand('notes.family', {
    description: 'Starts a running, a waiting, and a deferred command in its correlation.', input: empty,
    handle: async (_input, ctx) => {
      ctx.send('notes.edit.slow', { id: 'family' });
      ctx.send('counter.increment', {}, { delayMs: 60_000 });
      ctx.send('notes.ask', { id: 'family' });
      return {};
    },
  });
  ext.registerCommand('notes.touch.twice', {
    description: 'Publishes two transient touches of one note.', input: z.object({ id: z.string() }),
    handle: async ({ id }, ctx) => {
      ctx.publish('notes.touched', { id, step: 1 });
      ctx.publish('notes.touched', { id, step: 2 });
      return {};
    },
  });
  ext.registerCommand('notes.wait.send', {
    description: 'Sends a counter command that waits.', input: empty,
    handle: async (_input, ctx) => {
      ctx.send('counter.wait', {});
      return {};
    },
  });
  ext.registerCommand('notes.cancel.call', {
    description: 'Cancels a message.', input: z.object({ messageId: z.string() }),
    handle: async ({ messageId }, ctx) => {
      try {
        return { result: await ctx.command('kernel.cancel', { messageId }) };
      } catch (error) {
        return { code: codeOf(error) };
      }
    },
  });
  ext.registerQuery('notes.probe.get', {
    description: 'What the cancel probe saw.', input: empty, output: z.object({ codes: z.array(z.string()) }),
    handle: async () => ({ codes: workerState.probe }),
  });
}
