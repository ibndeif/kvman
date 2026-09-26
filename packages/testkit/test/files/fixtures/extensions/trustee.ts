import { defineExtension, z } from '@kvman/sdk';
import { attempt } from './attempts.ts';

// Holds kernel.admin and sends kernel commands, to prove what an administrator extension may do with trust (03 §3.8).
export default defineExtension({ name: '@acme/trustee', namespace: 'trustee', title: 'Trustee', description: 'Administers trust.' }, (ext) => {
  ext.requestCapability('kernel.admin', { reason: 'Administers trust.' });
  ext.registerCommand('trustee.call', {
    description: 'Sends a kernel command.', input: z.object({ type: z.string(), payload: z.record(z.string(), z.unknown()) }),
    handle: async ({ type, payload }, ctx) => attempt(() => ctx.command(type, JSON.parse(JSON.stringify(payload)))),
  });
});
