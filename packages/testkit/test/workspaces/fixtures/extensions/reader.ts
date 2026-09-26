import { defineExtension, z } from '@kvman/sdk';

// Requires pdf.import from whichever extension is enabled with the namespace `pdf`.
export default defineExtension({ name: '@acme/reader', namespace: 'reader', title: 'Reader', description: 'Reads imported PDFs.' }, (ext) => {
  ext.requestCapability('calls', { reason: 'Imports the PDFs it reads.', types: ['pdf.import'] });
  ext.requireTypes(['pdf.import'], { reason: 'Imports the PDFs it reads.' });
  ext.registerCommand('reader.read', { description: 'Reads a PDF.', input: z.object({}), handle: async () => ({}) });
});
