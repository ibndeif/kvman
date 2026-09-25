import { defineExtension, z } from '@kvman/sdk';

// Subscribes to notes' durable and transient events; its live event shows when each transient delivery runs.
export default defineExtension({ name: '@acme/audit', namespace: 'audit', title: 'Audit', description: 'Audits notes for the host tests.' }, (ext) => {
  ext.registerEvent('audit.touch.noted', { description: 'A touch delivery started or ended.', delivery: 'live', chunk: 'data' });
  ext.registerCommand('audit.cancel', {
    description: 'Cancels a message.', input: z.object({ messageId: z.string() }),
    handle: async ({ messageId }, ctx) => {
      try {
        return { result: await ctx.command('kernel.cancel', { messageId }) };
      } catch (error) {
        return { code: typeof error === 'object' && error !== null && 'problem' in error && typeof error.problem === 'object' && error.problem !== null && 'code' in error.problem ? error.problem.code : 'not-a-problem' };
      }
    },
  });
  ext.subscribe('notes.added', {
    description: 'Records added notes.',
    handle: async (payload, ctx) => {
      const id = z.object({ id: z.string() }).parse(payload).id;
      ctx.store.kv.set(`added:${id}`, true);
    },
  });
  ext.subscribe('notes.touched', {
    description: 'Records touches, one note at a time.', lane: 'note:{{ $payload.id }}',
    handle: async (payload, ctx) => {
      const { id, step } = z.object({ id: z.string(), step: z.number() }).parse(payload);
      ctx.live('audit.touch.noted', id, { data: { phase: 'start', step } });
      if (id === 'boom') throw new TypeError('boom');
      if (id === 'hold') await new Promise((resolve) => ctx.signal.addEventListener('abort', resolve));
      else await new Promise((resolve) => setTimeout(resolve, 30));
      ctx.live('audit.touch.noted', id, { data: { phase: 'end', step } });
      ctx.store.kv.set(`touched:${id}:${step}`, true);
    },
  });
});
