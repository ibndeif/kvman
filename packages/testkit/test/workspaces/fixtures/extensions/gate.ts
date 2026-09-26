import { defineExtension, z } from '@kvman/sdk';

// A gate a handler waits at until the test opens it: gate.wait defers, gate.open replies to it.
export default defineExtension({ name: '@acme/gate', namespace: 'gate', title: 'Gate', description: 'Holds handlers until the test opens it.' }, (ext) => {
  ext.registerCommand('gate.wait', { description: 'Waits until the gate opens.', input: z.object({}), handle: async (_input, ctx) => ctx.defer() });
  ext.registerCommand('gate.open', {
    description: 'Opens the gate for one waiting command.', input: z.object({ commandId: z.string() }),
    handle: async ({ commandId }, ctx) => {
      ctx.reply(commandId, {});
      return {};
    },
  });
});
