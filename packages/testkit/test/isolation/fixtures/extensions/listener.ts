import { defineExtension, z } from '@kvman/sdk';

// Subscribes to a foreign event, which its grant derives, and to a kernel event, which needs none.
export default defineExtension({ name: '@acme/listener', namespace: 'listener', title: 'Listener', description: 'Listens to the probe.' }, (ext) => {
  ext.requestCapability('calls', { reason: 'Asks the probe.', types: ['probe.count'] });
  ext.subscribe('probe.worked', {
    description: 'Counts probe.worked.',
    handle: async (_payload, ctx) => {
      ctx.store.kv.set('heard', ((await ctx.store.kv.get<number>('heard')) ?? 0) + 1);
    },
  });
  ext.subscribe('kernel.extension.enabled', { description: 'Notices enables.', handle: async () => undefined });
  ext.registerQuery('listener.heard', { description: 'How many probe.worked it received.', input: z.object({}), output: z.number(), handle: async (_input, ctx) => (await ctx.store.kv.get<number>('heard')) ?? 0 });
});
