import { defineExtension, z, type Ctx } from '@kvman/sdk';
import { outcomeOf } from './outcomes.ts';

// Each surface tried on Probe or the kernel without a capability (05 §5.7).
const surfaces: Record<string, (ctx: Ctx, workspaceId: string) => unknown> = {
  command: (ctx) => ctx.command('probe.work', { text: 'intruder' }),
  query: (ctx) => ctx.query('probe.scan', {}),
  live: (ctx) => ctx.live('probe.progress', 'intruder', { text: 'x' }),
  tool: (ctx) => ctx.command('probe.tool', {}),
  lookup: (ctx) => ctx.query('probe.lookup', {}),
  rename: (ctx, workspaceId) => ctx.command('kernel.workspace.rename', { workspaceId, name: 'Taken' }),
  messages: (ctx) => ctx.query('kernel.messages.list', {}),
};

// An extension with no capabilities.
export default defineExtension({ name: '@acme/intruder', namespace: 'intruder', title: 'Intruder', description: 'Tries what it may not.' }, (ext) => {
  ext.registerCommand('intruder.try', {
    description: 'Tries one surface and returns the outcome.', input: z.object({ surface: z.string() }),
    handle: async ({ surface }, ctx) => outcomeOf(() => surfaces[surface]?.(ctx, ctx.workspace?.id ?? '')),
  });
  ext.registerCommand('intruder.send', {
    description: 'Sends a foreign command in its unit.', input: z.object({}),
    handle: async (_input, ctx) => {
      ctx.send('probe.work', { text: 'intruder' });
      return {};
    },
  });
  ext.registerCommand('intruder.publish', {
    description: 'Publishes a foreign event in its unit.', input: z.object({}),
    handle: async (_input, ctx) => {
      ctx.publish('probe.worked', { text: 'intruder' });
      return {};
    },
  });
});
