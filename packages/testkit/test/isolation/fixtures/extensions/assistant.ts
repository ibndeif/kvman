import { defineExtension, z, type Ctx } from '@kvman/sdk';
import { outcomeOf } from './outcomes.ts';

const target = z.object({ type: z.string(), kind: z.enum(['command', 'query']) });

function use(ctx: Ctx, { type, kind }: z.output<typeof target>): Promise<unknown> {
  return kind === 'command' ? ctx.command(type, {}) : ctx.query(type, {});
}

// An agent-like extension that holds `tools` and no `calls` (05 §5.7, ADR 0133).
export default defineExtension({ name: '@acme/assistant', namespace: 'assistant', title: 'Assistant', description: 'Uses agent tools.' }, (ext) => {
  ext.requestCapability('tools', { reason: 'Runs the tools of the workspace.' });
  ext.registerCommand('assistant.use', { description: 'Uses a type from a workspace.', input: target, handle: async (input, ctx) => outcomeOf(() => use(ctx, input)) });
  ext.registerCommand('assistant.global.use', {
    description: 'Uses a type without a workspace.', input: target, scope: 'global', handle: async (input, ctx) => outcomeOf(() => use(ctx, input)),
  });
});
