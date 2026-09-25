import { defineExtension, z } from '@kvman/sdk';

// Subscribes to notes' durable and transient events; its live event shows when each transient delivery runs.
export default defineExtension({ name: '@acme/audit', namespace: 'audit', title: 'Audit', description: 'Audits notes for the host tests.' }, (ext) => {
  ext.registerEvent('audit.touch.noted', { description: 'A touch delivery started or ended.', delivery: 'live', chunk: 'data' });
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
      await new Promise((resolve) => setTimeout(resolve, 30));
      ctx.live('audit.touch.noted', id, { data: { phase: 'end', step } });
      ctx.store.kv.set(`touched:${id}:${step}`, true);
    },
  });
});
