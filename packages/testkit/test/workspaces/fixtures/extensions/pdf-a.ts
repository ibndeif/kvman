import { defineExtension, z } from '@kvman/sdk';

const empty = z.object({});

// One of two extensions with the namespace `pdf`; it provides pdf.import for Reader, and its config is workspace-only.
export default defineExtension({ name: '@acme/pdf-a', namespace: 'pdf', title: 'PDF A', description: 'A PDF extension for the workspace tests.' }, (ext) => {
  ext.registerEvent('pdf.imported', { description: 'A PDF was imported.', payload: z.object({ id: z.string() }) });
  ext.registerCommand('pdf.import', { description: 'Imports a PDF.', input: empty, handle: async () => ({}) });
  ext.registerCommand('pdf.global.ping', { description: 'Answers without a workspace.', input: empty, scope: 'global', handle: async () => ({ pong: true }) });
  ext.registerConfig({ scope: 'workspace', schema: z.object({ depth: z.number().default(1).describe('How many pages deep to import.') }) });
  ext.registerCommand('pdf.config.global', {
    description: 'Writes a global value, which its workspace-only config does not allow.', input: empty,
    handle: async (_input, ctx) => {
      ctx.config.set('global', { depth: 2 });
      return {};
    },
  });
});
