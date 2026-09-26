import { defineExtension, z } from '@kvman/sdk';

// Enabled next to Probe, subscribed only to its own event.
export default defineExtension({ name: '@acme/bystander', namespace: 'bystander', title: 'Bystander', description: 'Minds its own events.' }, (ext) => {
  ext.registerEvent('bystander.noted', { description: 'Something was noted.', payload: z.object({}) });
  ext.subscribe('bystander.noted', { description: 'Its own event.', handle: async () => undefined });
});
