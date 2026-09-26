import { defineExtension, z } from '@kvman/sdk';
import { outcomeOf } from './outcomes.ts';

const call = z.object({ type: z.string(), payload: z.json() });

// Holds kernel.admin: it may prepare and administer, never confirm a grant (03 §3.8).
export default defineExtension({ name: '@acme/warden', namespace: 'warden', title: 'Warden', description: 'Administers kvman.' }, (ext) => {
  ext.requestCapability('kernel.admin', { reason: 'Administers the workspaces.' });
  ext.registerCommand('warden.call', { description: 'Sends a kernel command.', input: call, handle: async ({ type, payload }, ctx) => outcomeOf(() => ctx.command(type, payload)) });
  ext.registerCommand('warden.ask', { description: 'Sends a kernel query.', input: call, handle: async ({ type, payload }, ctx) => outcomeOf(() => ctx.query(type, payload)) });
});
