import { defineExtension, z } from '@kvman/sdk';
import { attempt } from './attempts.ts';
import { spawnInput } from './spawn-options.ts';

// Asks Runner to spawn, so a delegated token carries Delegator's grants (ADR 0140).
export default defineExtension({ name: '@acme/delegator', namespace: 'delegator', title: 'Delegator', description: 'Delegates to processes.' }, (ext) => {
  ext.requestCapability('calls', { reason: 'Starts Runner jobs and pings Target.', types: ['runner.run', 'target.ping', 'target.serve'] });
  ext.registerCommand('delegator.start', {
    description: 'Makes Runner spawn with the given options, adding `context` to the chain.', input: z.object({ spawn: spawnInput, context: z.record(z.string(), z.string()).optional() }),
    handle: async ({ spawn, context }, ctx) => attempt(() => ctx.command('runner.run', { spawn: JSON.parse(JSON.stringify(spawn)) }, context === undefined ? {} : { context })),
  });
});
