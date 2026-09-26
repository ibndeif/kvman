import { defineExtension, z } from '@kvman/sdk';

// Enabled in workspace B only.
export default defineExtension({ name: '@acme/notes', namespace: 'notes', title: 'The notes extension', description: 'Keeps notes.' }, (ext) => {
  ext.registerCommand('notes.add', { description: 'Adds a note.', input: z.object({}), handle: async () => null });
});
