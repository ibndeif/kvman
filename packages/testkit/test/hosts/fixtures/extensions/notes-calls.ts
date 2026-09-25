import { z, type Ext } from '@kvman/sdk';
import { codeOf, codeOfCall, firstRun, workerState } from './notes-state.ts';

const empty = z.object({});
const continuation = z.object({ reply: z.object({ ok: z.boolean() }).loose(), context: z.record(z.string(), z.string()).optional() });

export function registerCalls(ext: Ext): void {
  ext.registerCommand('notes.summarize', {
    description: 'Waits for a counter result.', input: empty, handle: async (_input, ctx) => ctx.command('counter.increment', { by: 2 }),
  });
  ext.registerCommand('notes.summarize.strict', {
    description: 'Does not catch a failing command.', input: empty,
    handle: async (_input, ctx) => {
      await ctx.command('counter.fail', {});
      return {};
    },
  });
  ext.registerCommand('notes.fail.check', {
    description: 'Catches a failing command.', input: empty,
    handle: async (_input, ctx) => {
      try {
        await ctx.command('counter.fail', {});
        return { problem: null };
      } catch (error) {
        return { problem: typeof error === 'object' && error !== null && 'problem' in error ? JSON.parse(JSON.stringify(error.problem)) : null };
      }
    },
  });
  ext.registerCommand('notes.fail.send', {
    description: 'Sends a failing command with a continuation.', input: z.object({ target: z.string() }),
    handle: async ({ target }, ctx) => {
      ctx.send(target, {}, { onReply: { type: 'notes.archive.record' } });
      return {};
    },
  });
  ext.registerCommand('notes.archive', {
    description: 'Sends with a continuation.', input: z.object({ deadlineAt: z.number().optional() }),
    handle: async ({ deadlineAt }, ctx) => {
      const deadline = deadlineAt === undefined ? {} : { deadlineAt };
      ctx.send('counter.increment', { by: 1 }, { onReply: { type: 'notes.archive.record', context: { note: 'n1' } }, ...deadline });
      return {};
    },
  });
  ext.registerCommand('notes.archive.record', {
    description: 'Records a continuation.', input: continuation, access: 'internal',
    handle: async (_input, ctx) => {
      ctx.store.kv.set(`continuation:${ctx.message.causationId ?? ''}`, ctx.message.payload);
      return {};
    },
  });
  ext.registerCommand('notes.edit', {
    description: 'Calls into its own lane.', input: z.object({ id: z.string() }), lane: 'note:{{ $payload.id }}',
    handle: async ({ id }, ctx) => ({ code: await codeOfCall(() => ctx.command('notes.edit', { id })) }),
  });
  ext.registerCommand('notes.call', {
    description: 'Calls a command and reports the code.', input: z.object({ target: z.string() }),
    handle: async ({ target }, ctx) => ({ code: await codeOfCall(() => ctx.command(target, {})) }),
  });
  ext.registerCommand('notes.count.check', {
    description: 'Queries the counter.', input: empty,
    handle: async (_input, ctx) => ({
      total: await ctx.query('counter.total.get', {}), missing: await codeOfCall(() => ctx.query('counter.missing.get', {})),
    }),
  });
  ext.registerCommand('notes.remind', {
    description: 'Sends once a day.', input: empty,
    handle: async (_input, ctx) => {
      ctx.send('counter.increment', { by: 1 }, { idempotencyKey: 'daily' });
      return {};
    },
  });
  ext.registerCommand('notes.redeliver', {
    description: 'Calls a command, then fails its first attempt.', input: empty,
    handle: async (_input, ctx) => {
      const result = await ctx.command('counter.increment', {});
      if (await firstRun(ctx, 'after')) throw ctx.problem('notes/RETRY_ME');
      return result;
    },
  });
  ext.registerCommand('notes.bump', {
    description: 'Reads, lets another writer change the entry, streams, and writes.', input: empty,
    handle: async (_input, ctx) => {
      const count = (await ctx.store.kv.get<number>('bump')) ?? 0;
      await ctx.command('notes.bump.write', {});
      ctx.live('notes.text.streamed', 'bump', { text: String(count) });
      ctx.store.kv.set('bump', count + 1);
      return { count };
    },
  });
  ext.registerCommand('notes.bump.write', {
    description: 'Changes the bump entry.', input: empty,
    handle: async (_input, ctx) => {
      ctx.store.kv.set('bump', ((await ctx.store.kv.get<number>('bump')) ?? 0) + 100);
      return {};
    },
  });
  ext.registerCommand('notes.late', {
    description: 'Uses its ctx after returning.', input: empty,
    handle: async (_input, ctx) => {
      setTimeout(() => {
        ctx.command('counter.increment', {}).catch((error: unknown) => workerState.late.push(codeOf(error)));
        try {
          ctx.send('counter.increment', {});
        } catch (error) {
          workerState.late.push(codeOf(error));
        }
      }, 0);
      return {};
    },
  });
}
