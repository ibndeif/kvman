import type { Ctx } from '@kvman/sdk';
import { builtinHelp, errorOutput, jsonOutput, type CallResult } from '../connector-line.ts';
import { cancelJob, jobDetail, jobRows, type JobRow } from '../jobs/job-rows.ts';

// The `jobs` connector (ADR 0009, 88, 150, and 151): the work this session started with `--async` or `mode: 'async'`,
// listed, read, or cancelled by the id `started <id>` printed.

const forAgent = (row: JobRow) => ({ id: row.id, kind: row.kind, call: row.call, status: row.status, startedAt: row.startedAt, ...(row.endedAt === undefined ? {} : { endedAt: row.endedAt }), ...(row.exitCode === undefined ? {} : { exitCode: row.exitCode }) });

export async function jobsCall(ctx: Ctx, sessionId: string, words: readonly string[]): Promise<CallResult> {
  const [command, id, ...extra] = words;
  if (command === '-h' && id === undefined) return { output: builtinHelp.jobs, exitCode: 0 };
  if (command === 'list' && id === undefined) return jsonOutput((await jobRows(ctx, sessionId)).map(forAgent));
  if ((command !== 'get' && command !== 'cancel') || id === undefined || extra.length > 0) return errorOutput({ code: 'VALIDATION_FAILED', message: 'Use `jobs list`, `jobs get <id>`, or `jobs cancel <id>`.' });
  const found = await jobDetail(ctx, sessionId, id);
  if (found === undefined) return errorOutput({ code: 'kvcoder/JOB_NOT_FOUND', message: `This chat started no background job ${id}.` });
  if (command === 'get') return jsonOutput({ ...forAgent(found.row), ...found.detail });
  return jsonOutput({ cancelled: await cancelJob(ctx, sessionId, found.row, 'agent') });
}
