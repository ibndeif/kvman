import { z, type Ctx, type Json, type Stored } from '@kvman/sdk';
import { builtinHelp, errorOutput, jsonOutput, type CallResult } from '../connector-line.ts';
import type { BackgroundDoc } from '../schemas/records.ts';
import { records } from '../store/collections.ts';
import { cancelTurn } from '../turns/cancel-turn.ts';
import { appendBackground, backgroundText } from '../turns/background.ts';
import { childResult } from '../turns/end-turn.ts';

// The `jobs` connector (ADR 0009, 88): the work this session started with `--async`, connector calls and async
// subagents, listed, read, or cancelled by the id `started <id>` printed.

const jobSchema = z.object({ status: z.string(), createdAt: z.string(), startedAt: z.string().exactOptional(), endedAt: z.string().exactOptional(), output: z.json().exactOptional(), problem: z.json().exactOptional() });

type Row = { id: string; kind: BackgroundDoc['kind']; call: string; status: string; startedAt: string; endedAt?: string };

async function connectorRow(ctx: Ctx, entry: Stored<BackgroundDoc>): Promise<{ row: Row; detail: Record<string, Json> }> {
  const job = jobSchema.parse(await ctx.exec('kernel.jobs.get', { id: entry.ref }));
  const row: Row = { id: entry.ref, kind: entry.kind, call: entry.call, status: job.status, startedAt: job.startedAt ?? entry.startedAt, ...(job.endedAt === undefined ? {} : { endedAt: job.endedAt }) };
  return { row, detail: { ...(job.output === undefined ? {} : { output: job.output }), ...(job.problem === undefined ? {} : { problem: job.problem }) } };
}

async function subagentRow(ctx: Ctx, entry: Stored<BackgroundDoc>): Promise<{ row: Row; detail: Record<string, Json> }> {
  const store = records(ctx.store);
  const child = await store.sessions.get(entry.ref);
  const [turn] = await store.turns.find({ sessionId: entry.ref }, { limit: 1, order: 'desc' });
  const outcome = turn?.outcome ?? null;
  const status = child === undefined || outcome === null ? 'running' : outcome === 'done' ? 'succeeded' : outcome === 'cancelled' ? 'cancelled' : 'failed';
  const row: Row = { id: entry.ref, kind: entry.kind, call: entry.call, status, startedAt: entry.startedAt, ...(turn?.endedAt === null || turn === undefined ? {} : { endedAt: turn.endedAt }) };
  return { row, detail: outcome === null ? {} : { output: (await childResult(ctx, entry.ref, outcome)).text } };
}

const rowOf = (ctx: Ctx, entry: Stored<BackgroundDoc>) => (entry.kind === 'connector' ? connectorRow(ctx, entry) : subagentRow(ctx, entry));

export async function jobsCall(ctx: Ctx, sessionId: string, words: readonly string[]): Promise<CallResult> {
  const [command, id, ...extra] = words;
  if (command === '-h' && id === undefined) return { output: builtinHelp.jobs, exitCode: 0 };
  const store = records(ctx.store);
  if (command === 'list' && id === undefined) {
    const entries = await store.background.find({ sessionId }, { limit: 50, order: 'desc' });
    return jsonOutput(await Promise.all(entries.map(async (entry) => (await rowOf(ctx, entry)).row)));
  }
  if ((command !== 'get' && command !== 'cancel') || id === undefined || extra.length > 0) return errorOutput({ code: 'VALIDATION_FAILED', message: 'Use `jobs list`, `jobs get <id>`, or `jobs cancel <id>`.' });
  const [entry] = await store.background.find({ sessionId, ref: id }, { limit: 1 });
  if (entry === undefined) return errorOutput({ code: 'kvcoder/JOB_NOT_FOUND', message: `This chat started no background job ${id}.` });
  if (command === 'get') {
    const { row, detail } = await rowOf(ctx, entry);
    return jsonOutput({ ...row, ...detail });
  }
  if (entry.kind === 'connector') {
    await ctx.cancel(entry.ref);
  } else if (await cancelTurn(ctx, entry.ref, false)) {
    const result = await childResult(ctx, entry.ref, 'cancelled');
    await appendBackground(ctx, sessionId, { kind: 'subagent', sessionId: entry.ref }, backgroundText(entry.call, entry.ref, result.text), false);
  }
  return jsonOutput({ cancelled: true });
}
