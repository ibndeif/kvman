import { defineExtension, z } from '@kvman/sdk';

// The other extension with the namespace `pdf`.
export default defineExtension({ name: '@acme/pdf-b', namespace: 'pdf', title: 'PDF B', description: 'Another PDF extension for the workspace tests.' }, (ext) => {
  ext.registerCommand('pdf.import', { description: 'Imports a PDF another way.', input: z.object({}), handle: async () => ({}) });
});
