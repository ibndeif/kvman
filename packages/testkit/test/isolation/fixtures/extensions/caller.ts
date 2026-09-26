import { defineExtension, z } from '@kvman/sdk';
import { outcomeOf } from './outcomes.ts';

// Calls Probe's global command from a workspace and without one (ADR 0133: the calling invocation's grant).
export default defineExtension({ name: '@acme/caller', namespace: 'caller', title: 'Caller', description: 'Calls the probe.' }, (ext) => {
  ext.requestCapability('calls', { reason: 'Pings the probe.', types: ['probe.*'] });
  ext.registerCommand('caller.ping', { description: 'Pings from a workspace.', input: z.object({}), handle: async (_input, ctx) => outcomeOf(() => ctx.command('probe.global.ping', {})) });
  ext.registerCommand('caller.global', {
    description: 'Pings without a workspace.', input: z.object({}), scope: 'global', handle: async (_input, ctx) => outcomeOf(() => ctx.command('probe.global.ping', {})),
  });
});
