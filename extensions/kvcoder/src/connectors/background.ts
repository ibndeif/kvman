import { z, type Ctx } from '@kvman/sdk';
import { cancelJob, jobDetail, jobRows, type JobRow } from '../jobs/job-rows.ts';
import { callInput, type ConnectorCommand } from './connector-command.ts';

// The `background` connector (plan 08 §8.5, ADR 0011, 6): what this chat started with `background: true`, a process or
// a subagent, listed, read, or stopped by the id the starting call returned. The agent sees no kernel job.

/** What the prompt's index says the connector is for. */
export const backgroundDescription = 'Follow up on what you started with background set to true: a server or other long-running shell line, or a background subagent. Use it to see its status or output, or to stop it.';

const started = z.strictObject({ id: z.string().min(1).describe('The id that the call which started the work returned.') });

const payloads = { list: z.strictObject({}), output: started, stop: started };

export const backgroundCommands = {
  list: { registration: 'kvcoder.background.list', description: "Lists this chat's newest 50 background runs, newest first.", payload: payloads.list, asks: false },
  output: { registration: 'kvcoder.background.output.get', description: "Gives one background run's status, and its output (a process's last 100 lines, a subagent's answer, or what a program worker's run returned).", payload: payloads.output, asks: false },
  stop: { registration: 'kvcoder.background.stop', description: "Stops a background process or a program worker's run, or cancels a background subagent.", payload: payloads.stop, asks: false },
} satisfies Record<string, ConnectorCommand>;

const rowSchema = z.object({
  id: z.string(),
  kind: z.enum(['process', 'subagent', 'worker']),
  call: z.string(),
  status: z.string(),
  startedAt: z.string(),
  endedAt: z.string().exactOptional(),
  exitCode: z.number().int().exactOptional(),
});

const forAgent = (row: JobRow): z.output<typeof rowSchema> => ({ id: row.id, kind: row.kind, call: row.call, status: row.status, startedAt: row.startedAt, ...(row.endedAt === undefined ? {} : { endedAt: row.endedAt }), ...(row.exitCode === undefined ? {} : { exitCode: row.exitCode }) });

async function startedBy(ctx: Ctx, sessionId: string, id: string) {
  const found = await jobDetail(ctx, sessionId, id);
  if (found === undefined) throw ctx.problem('kvcoder/JOB_NOT_FOUND', { sessionId, id });
  return found;
}

const commands = backgroundCommands;

export function registerBackgroundConnector(ctx: Ctx): void {
  ctx.registerQuery('kvcoder.background.list', {
    description: commands.list.description,
    input: callInput(payloads.list),
    output: z.array(rowSchema),
    handle: async ({ sessionId }) => (await jobRows(ctx, sessionId)).map(forAgent),
  });
  ctx.registerQuery('kvcoder.background.output.get', {
    description: commands.output.description,
    input: callInput(payloads.output),
    output: rowSchema.extend({ output: z.json().exactOptional(), problem: z.json().exactOptional() }),
    handle: async ({ sessionId, payload }) => {
      const found = await startedBy(ctx, sessionId, payload.id);
      return { ...forAgent(found.row), ...found.detail };
    },
  });
  ctx.registerCommand('kvcoder.background.stop', {
    description: commands.stop.description,
    input: callInput(payloads.stop),
    output: z.object({ stopped: z.boolean() }),
    retries: 0,
    handle: async ({ sessionId, payload }) => ({ stopped: await cancelJob(ctx, sessionId, (await startedBy(ctx, sessionId, payload.id)).row, 'agent') }),
  });
}
