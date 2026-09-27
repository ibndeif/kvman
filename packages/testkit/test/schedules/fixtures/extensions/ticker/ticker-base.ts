import { z, type Ctx, type Ext, type ScheduleDef } from '@kvman/sdk';

const empty = z.object({});
const run = z.object({ id: z.string(), type: z.string(), source: z.string(), priority: z.string(), workspaceId: z.string().nullable(), payload: z.json(), notBefore: z.number().nullable() });

// Records the run's message envelope in the global collection `runs`.
async function record(ctx: Ctx): Promise<Record<string, never>> {
  const { message } = ctx;
  ctx.store.global.collection('runs').put({
    id: message.id, type: message.type, source: message.source, priority: message.priority, workspaceId: message.workspaceId ?? null, payload: message.payload,
    notBefore: message.notBefore ?? null,
  });
  return {};
}

// The setup of one version of Ticker, the schedule tests' fixture: the schedules it declares, by name.
export const tickerMeta = { name: '@acme/ticker', namespace: 'ticker', title: 'Ticker', description: 'Schedules for the tests.' };

export function tickerSetup(schedules: Record<string, ScheduleDef>): (ext: Ext) => void {
  return (ext) => {
    const runs = ext.registerCollection('runs', { description: 'Every run.', schema: run });
    ext.registerError('ticker/BROKEN', { description: 'Always fails.', title: 'The ticker broke' });
    ext.registerCommand('ticker.tick', { description: 'A regular run.', input: empty, access: 'internal', handle: async (_input, ctx) => record(ctx) });
    ext.registerCommand('ticker.daily', { description: 'A daily run.', input: empty, access: 'internal', handle: async (_input, ctx) => record(ctx) });
    ext.registerCommand('ticker.sweep', { description: 'A global run.', input: empty, access: 'internal', scope: 'global', handle: async (_input, ctx) => record(ctx) });
    ext.registerCommand('ticker.broken', {
      description: 'A run that fails.', input: empty, access: 'internal',
      handle: async (_input, ctx) => {
        await record(ctx);
        throw ctx.problem('ticker/BROKEN');
      },
    });
    ext.registerQuery('ticker.runs.list', { description: 'Every run so far.', input: empty, output: z.array(run), handle: async (_input, ctx) => ctx.store.global.collection(runs).find() });
    for (const [name, definition] of Object.entries(schedules)) ext.registerSchedule(name, definition);
  };
}
