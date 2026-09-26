import { defineExtension, z } from '@kvman/sdk';

// Installed and enabled nowhere.
export default defineExtension({ name: '@acme/idle', namespace: 'idle', title: 'The idle extension', description: 'Keeps idle.' }, (ext) => {
  ext.registerCommand('idle.wait', { description: 'Waits.', input: z.object({}), handle: async () => null });
});
