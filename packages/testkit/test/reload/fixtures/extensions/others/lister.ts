import { defineExtension, z } from '@kvman/sdk';

// Requires notes.items.list, which Notes 2.6.0 no longer provides.
export default defineExtension({ name: '@acme/lister', namespace: 'lister', title: 'Lister', description: 'Lists notes.' }, (ext) => {
  ext.requestCapability('calls', { reason: 'Lists the notes it shows.', types: ['notes.items.list'] });
  ext.requireTypes(['notes.items.list'], { reason: 'Lists the notes it shows.' });
  ext.registerCommand('lister.show', { description: 'Shows the notes.', input: z.object({}), handle: async () => ({}) });
});
