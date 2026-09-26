import { defineExtension, z } from '@kvman/sdk';

// Requests calls, llm, and dedicated isolation, and subscribes to a foreign event: every part of a grant.
export default defineExtension({ name: '@acme/asker', namespace: 'asker', title: 'Asker', description: 'Asks about PDFs.' }, (ext) => {
  ext.requestCapability('calls', { reason: 'Imports PDFs.', types: ['pdf.*'] });
  ext.requestCapability('llm', { reason: 'Summarizes PDFs.' });
  ext.requestIsolation('dedicated', { reason: 'Runs a large parser.' });
  ext.subscribe('pdf.imported', { description: 'Summarizes each imported PDF.', handle: async () => undefined });
  ext.registerCommand('asker.ask', { description: 'Asks about a PDF.', input: z.object({}), handle: async () => ({}) });
});
