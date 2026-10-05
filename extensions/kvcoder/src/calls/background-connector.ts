import { z, type Ctx } from '@kvman/sdk';
import { cancelJob, jobDetail, jobRows, type JobRow } from '../jobs/job-rows.ts';
import { callInput, payloads } from '../schemas/payloads.ts';
import { builtinCommands } from './builtin-connectors.ts';

// The `background` connector (plan 08 §8.5, ADR 0011, 6): what this chat started with `background: true`, a process or
// a subagent, listed, read, or stopped by the id the starting call returned. The agent sees no kernel job.

const rowSchema = z.object({
  id: z.string(),
  kind: z.enum(['process', 'subagent']),
  call: z.string(),
  status: z.string(),
  startedAt: z.string(),
  endedAt: z.string().exactOptional(),
  exitCode: z.number().int().exactOptional(),
});

const forAgent = (row: JobRow): z.output<typeof rowSchema> => ({ id: row.id, kind: row.kind, call: row.call, status: row.status, startedAt: row.startedAt, ...(row.endedAt === undefined ? {} : { endedAt: row.endedAt }), ...(row.exitCode === undefined ? {} : { exitCode: row.exitCode }) });

async function started(ctx: Ctx, sessionId: string, id: string) {
  const found = await jobDetail(ctx, sessionId, id);
  if (found === undefined) throw ctx.problem('kvcoder/JOB_NOT_FOUND', { sessionId, id });
  return found;
}

const commands = builtinCommands.background;

export function registerBackgroundConnector(ctx: Ctx): void {
  ctx.registerQuery('kvcoder.background.list', {
    description: commands.list.description,
    input: callInput(payloads.backgroundList),
    output: z.array(rowSchema),
    handle: async ({ sessionId }) => (await jobRows(ctx, sessionId)).map(forAgent),
  });
  ctx.registerQuery('kvcoder.background.output.get', {
    description: commands.output.description,
    input: callInput(payloads.backgroundOutput),
    output: rowSchema.extend({ output: z.json().exactOptional(), problem: z.json().exactOptional() }),
    handle: async ({ sessionId, payload }) => {
      const found = await started(ctx, sessionId, payload.id);
      return { ...forAgent(found.row), ...found.detail };
    },
  });
  ctx.registerCommand('kvcoder.background.stop', {
    description: commands.stop.description,
    input: callInput(payloads.backgroundStop),
    output: z.object({ stopped: z.boolean() }),
    retries: 0,
    handle: async ({ sessionId, payload }) => ({ stopped: await cancelJob(ctx, sessionId, (await started(ctx, sessionId, payload.id)).row, 'agent') }),
  });
}
