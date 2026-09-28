import { defineExtension, z } from '@kvman/sdk';

// An extension without `ui` that sends a notification anyway.
export default defineExtension({ name: '@acme/quiet', namespace: 'quiet', title: 'Quiet', description: 'Sends a notice without the ui capability.' }, (ext) => {
  ext.requestIsolation('shared', { reason: 'Runs in the shared host for the notification tests.' });
  ext.registerCommand('quiet.emit', {
    description: 'Writes a note, then notifies.', input: z.object({}),
    handle: async (_input, ctx) => {
      ctx.store.kv.set('note', 'x');
      ctx.ui.notify({ title: '$t.notify.done' });
      return {};
    },
  });
  ext.registerQuery('quiet.note.get', { description: 'The note.', input: z.object({}), output: z.object({ note: z.json().nullable() }), handle: async (_input, ctx) => ({ note: (await ctx.store.kv.get('note')) ?? null }) });
});
