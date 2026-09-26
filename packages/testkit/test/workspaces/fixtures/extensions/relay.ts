import { defineExtension, z } from '@kvman/sdk';
import { codeOfCall } from './outcomes.ts';

// A global-scope command that calls two other extensions' global commands (06 §6.4: the intersection of its grants).
export default defineExtension({ name: '@acme/relay', namespace: 'relay', title: 'Relay', description: 'Relays pings.' }, (ext) => {
  ext.requestCapability('calls', { reason: 'Pings the desk and the PDF extension.', types: ['desk.*', 'pdf.*'] });
  ext.registerCommand('relay.both', {
    description: 'Pings both without a workspace.', input: z.object({}), scope: 'global',
    handle: async (_input, ctx) => ({
      desk: await codeOfCall(() => ctx.command('desk.global.ping', {})),
      pdf: await codeOfCall(() => ctx.command('pdf.global.ping', {})),
    }),
  });
});
