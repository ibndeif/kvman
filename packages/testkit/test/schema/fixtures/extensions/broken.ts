import { defineExtension, z } from '@kvman/sdk';

// Quarantined.
export default defineExtension({ name: '@acme/broken', namespace: 'broken', title: 'The broken extension', description: 'Keeps broken.' }, (ext) => {
  ext.registerCommand('broken.run', { description: 'Runs.', input: z.object({}), handle: async () => null });
});
