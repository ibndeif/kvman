import type { Ctx, Json, Stored } from '@kvman/sdk';
import { stopRun } from '../delegate/runs.ts';
import type { BackgroundDoc, RunDoc } from '../schemas/records.ts';
import { records } from '../store/collections.ts';
import { cancelTurn } from '../turns/cancel-turn.ts';
import { appendBackground, backgroundText } from '../turns/background.ts';
import { childResult } from '../turns/end-turn.ts';
import { processStatus, sessionProcess } from './process-records.ts';
import { outputTail } from './process-report.ts';
import { stopProcess } from './process-run.ts';
import { localLinks } from './process-text.ts';

// A session's background runs (ADR 0009, 88, 150, and 152; ADR 0011, 6): the processes and subagents it started with
// `background: true`, as the `background` connector and `kvcoder.job.*` show them.

export type JobRow = { id: string; kind: 'process' | 'subagent' | 'worker'; title: string; call: string; status: string; startedAt: string; endedAt?: string; exitCode?: number };
export type JobDetail = { row: JobRow; detail: Record<string, Json> };

const outputLines = 100;

async function subagentRow(ctx: Ctx, entry: Stored<BackgroundDoc>): Promise<JobDetail> {
  const store = records(ctx.store);
  const child = await store.sessions.get(entry.ref);
  const [turn] = await store.turns.find({ sessionId: entry.ref }, { limit: 1, order: 'desc' });
  const outcome = turn?.outcome ?? null;
  const status = child === undefined || outcome === null ? 'running' : outcome === 'done' ? 'succeeded' : outcome === 'cancelled' ? 'cancelled' : 'failed';
  const row: JobRow = { id: entry.ref, kind: 'subagent', title: entry.call, call: entry.call, status, startedAt: entry.startedAt, ...(turn?.endedAt === null || turn === undefined ? {} : { endedAt: turn.endedAt }) };
  return { row, detail: outcome === null ? {} : { output: (await childResult(ctx, entry.ref, outcome)).text } };
}

async function processRow(ctx: Ctx, id: string, sessionId: string): Promise<JobDetail | undefined> {
  const doc = await sessionProcess(ctx, sessionId, id);
  if (doc === undefined) return undefined;
  const row: JobRow = { id: doc.id, kind: 'process', title: doc.title, call: doc.call, status: processStatus(doc), startedAt: doc.startedAt, ...(doc.endedAt === undefined ? {} : { endedAt: doc.endedAt }), ...(typeof doc.exitCode === 'number' ? { exitCode: doc.exitCode } : {}) };
  return { row, detail: { output: await outputTail(ctx, doc.id, outputLines) } };
}

// A program worker's run (ADR 0021, 33): its output is what the call returned, once it has ended.
function runRow(run: Stored<RunDoc>): JobDetail {
  const row: JobRow = { id: run.id, kind: 'worker', title: run.worker, call: run.call, status: run.status, startedAt: run.startedAt, ...(run.endedAt === null ? {} : { endedAt: run.endedAt }), ...(run.exitCode === null ? {} : { exitCode: run.exitCode }) };
  return { row, detail: run.output === null ? {} : { output: run.output } };
}

/** One job of the session by its id, with its output or problem; `undefined` when the session started no such job. */
export async function jobDetail(ctx: Ctx, sessionId: string, id: string): Promise<JobDetail | undefined> {
  const process = await processRow(ctx, id, sessionId);
  if (process !== undefined) return process;
  const run = await records(ctx.store).runs.get(id);
  if (run !== undefined) return run.sessionId === sessionId ? runRow(run) : undefined;
  const [entry] = await records(ctx.store).background.find({ sessionId, ref: id }, { limit: 1 });
  return entry === undefined || entry.kind !== 'subagent' ? undefined : subagentRow(ctx, entry);
}

/** The session's newest 50 jobs, newest first. */
export async function jobRows(ctx: Ctx, sessionId: string): Promise<JobRow[]> {
  const store = records(ctx.store);
  const [entries, processes, runs] = await Promise.all([store.background.find({ sessionId }, { limit: 50, order: 'desc' }), store.processes.find({ sessionId }, { limit: 50, order: 'desc' }), store.runs.find({ sessionId }, { limit: 50, order: 'desc' })]);
  const newest = [...entries.map((entry) => ({ id: entry.ref, startedAt: entry.startedAt })), ...[...processes, ...runs].map((doc) => ({ id: doc.id, startedAt: doc.startedAt }))].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 50);
  const found = await Promise.all(newest.map((job) => jobDetail(ctx, sessionId, job.id)));
  return found.flatMap((job) => (job === undefined ? [] : [job.row]));
}

/** What the person's list adds to a row: the localhost links in a process's output. */
export async function linksOf(ctx: Ctx, sessionId: string, row: JobRow): Promise<string[]> {
  if (row.kind !== 'process') return [];
  const doc = await sessionProcess(ctx, sessionId, row.id);
  return doc === undefined ? [] : localLinks(await outputTail(ctx, doc.id, outputLines));
}

/** Stops a process or a run, or cancels a subagent and tells the session; `false` for a process or a run that had ended already. */
export async function cancelJob(ctx: Ctx, sessionId: string, row: JobRow, by: 'agent' | 'person'): Promise<boolean> {
  if (row.kind === 'worker') {
    const run = await records(ctx.store).runs.get(row.id);
    return run !== undefined && stopRun(ctx, run);
  }
  if (row.kind === 'process') {
    const doc = await sessionProcess(ctx, sessionId, row.id);
    return doc !== undefined && stopProcess(ctx, doc, by);
  }
  if (await cancelTurn(ctx, row.id, false)) {
    const result = await childResult(ctx, row.id, 'cancelled');
    await appendBackground(ctx, sessionId, { kind: 'subagent', sessionId: row.id }, backgroundText(row.call, row.id, result.text), false);
  }
  return true;
}
