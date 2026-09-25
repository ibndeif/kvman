import { defineExtension, z } from '@kvman/sdk';

// Loaded against a manifest that the host tests change after recording it.
export default defineExtension({ name: '@acme/drift', namespace: 'drift', title: 'Drift', description: 'Drifts for the host tests.' }, (ext) => {
  ext.registerCommand('drift.run', { description: 'Runs.', input: z.object({}), handle: async () => ({}) });
});
