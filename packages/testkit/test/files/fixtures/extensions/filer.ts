import { defineExtension, z } from '@kvman/sdk';
import { attempt } from './attempts.ts';
import { operation, registerRun, runOperation } from './file-operations.ts';

// Reads and writes workspace files for the M2.5 tests (07 §7.2, ADR 0136).
export default defineExtension({ name: '@acme/filer', namespace: 'filer', title: 'Filer', description: 'Uses workspace files.' }, (ext) => {
  ext.requestCapability('files.read', { reason: 'Reads workspace files.' });
  ext.requestCapability('files.write', { reason: 'Writes workspace files.' });
  registerRun(ext, 'filer.run');
  ext.registerQuery('filer.look', { description: 'Runs one ctx.files call in a query.', input: operation, output: z.unknown(), handle: async (input, ctx) => runOperation(ctx, input) });
  ext.registerCommand('filer.global', {
    description: 'Reads a file without a workspace.', input: z.object({}), scope: 'global', handle: async (_input, ctx) => attempt(() => ctx.files.read('a.md')),
  });
  ext.registerCommand('filer.blob', {
    description: 'Puts a workspace file as a blob.', input: z.object({ path: z.string() }),
    handle: async ({ path }, ctx) => attempt(async () => (await ctx.store.blobs.put({ workspacePath: path })).blobId),
  });
});
