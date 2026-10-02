import { z, type Ctx } from '@kvman/sdk';
import { findSession, userOnly } from '../sessions/session-lookup.ts';
import { cancelJob, jobDetail, jobRows, linksOf, type JobRow } from './job-rows.ts';

// The person's view of a session's background jobs (ADR 0009, 152): list, read, and cancel, for the Running chip.

const sessionJobSchema = z.object({ sessionId: z.string(), id: z.string() });
const rowSchema = z.object({
  id: z.string(),
  kind: z.enum(['process', 'connector', 'subagent']),
  title: z.string(),
  call: z.string(),
  status: z.string(),
  startedAt: z.string(),
  endedAt: z.string().exactOptional(),
  exitCode: z.number().int().exactOptional(),
  links: z.array(z.string()),
});

const withLinks = async (ctx: Ctx, sessionId: string, row: JobRow) => ({ ...row, links: await linksOf(ctx, sessionId, row) });

export function registerJobs(ctx: Ctx): void {
  ctx.registerQuery('kvcoder.job.list', {
    description: "A chat's newest 50 background jobs (processes, --async connector calls, and subagents), running ones first.",
    input: z.object({ sessionId: z.string() }),
    output: z.array(rowSchema),
    public: true,
    handle: async ({ sessionId }) => {
      userOnly(ctx, 'kvcoder.job.list');
      await findSession(ctx, sessionId);
      const rows = await Promise.all((await jobRows(ctx, sessionId)).map((row) => withLinks(ctx, sessionId, row)));
      return [...rows.filter((row) => row.status === 'running'), ...rows.filter((row) => row.status !== 'running')];
    },
  });
  ctx.registerQuery('kvcoder.job.get', {
    description: "One background job of a chat with its output: a process's last 100 lines, a connector call's output, or a subagent's result.",
    input: sessionJobSchema,
    output: rowSchema.extend({ output: z.json().exactOptional(), problem: z.json().exactOptional() }),
    public: true,
    handle: async ({ sessionId, id }) => {
      userOnly(ctx, 'kvcoder.job.get');
      await findSession(ctx, sessionId);
      const found = await jobDetail(ctx, sessionId, id);
      if (found === undefined) throw ctx.problem('kvcoder/JOB_NOT_FOUND', { sessionId, id });
      return { ...(await withLinks(ctx, sessionId, found.row)), ...found.detail };
    },
  });
  ctx.registerCommand('kvcoder.job.cancel', {
    description: 'Stops a running background process, or cancels a connector call or subagent a chat started with --async.',
    input: sessionJobSchema,
    output: z.object({}),
    public: true,
    handle: async ({ sessionId, id }) => {
      userOnly(ctx, 'kvcoder.job.cancel');
      await findSession(ctx, sessionId);
      const found = await jobDetail(ctx, sessionId, id);
      if (found === undefined) throw ctx.problem('kvcoder/JOB_NOT_FOUND', { sessionId, id });
      await cancelJob(ctx, sessionId, found.row, 'person');
      return {};
    },
  });
}
