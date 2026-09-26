import { defineExtension, z } from '@kvman/sdk';
import { outcomeOf } from './outcomes.ts';

// An extension granted kernel.admin, which sends kernel commands on a person's behalf.
export default defineExtension({ name: '@acme/steward', namespace: 'steward', title: 'Steward', description: 'Administers the workspaces.' }, (ext) => {
  ext.requestCapability('kernel.admin', { reason: 'Opens and renames workspaces.' });
  ext.registerCommand('steward.call', {
    description: 'Calls a kernel command and reports its result or problem.', input: z.object({ type: z.string(), payload: z.json() }),
    handle: async ({ type, payload }, ctx) => outcomeOf(() => ctx.command(type, payload)),
  });
});
