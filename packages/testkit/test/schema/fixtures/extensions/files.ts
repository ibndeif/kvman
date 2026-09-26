import { defineExtension, z } from '@kvman/sdk';

const handle = async (): Promise<null> => null;
const input = z.object({});

// Enabled in workspace A only, with an internal command and a secret config field.
export default defineExtension({ name: '@acme/files', namespace: 'files', title: 'The files extension', description: 'Keeps files.' }, (ext) => {
  ext.registerCommand('files.add', { description: 'Adds a file.', input, handle });
  ext.registerCommand('files.prune', { description: 'Prunes old files.', input, access: 'internal', handle });
  ext.registerConfig({ scope: 'workspace', schema: z.object({ token: z.string().describe('The API token.').meta({ secret: true }) }) });
});
