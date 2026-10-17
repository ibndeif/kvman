import type { Ctx, Json, Stored } from '@kvman/sdk';
import { stopRun } from '../delegate/runs.ts';
import type { BackgroundDoc, RunDoc } from '../schemas/records.ts';
import { allDocs } from '../store/all-docs.ts';
import { records } from '../store/collections.ts';
import { appendBackground, backgroundText } from '../turns/background.ts';
import { helperProgress, waitingFor } from './helper-progress.ts';
import { cancelTurn, childResult } from '../turns/end-turn.ts';
import { processStatus, sessionProcess } from './process-records.ts';
import { outputTail } from './process-report.ts';
import { stopProcess } from './process-run.ts';
import { localLinks } from './process-text.ts';

// A session's background runs (ADR 0009, 88, 150, and 152; ADR 0011, 6): the processes and subagents it started with
// `background: true`, as the `background` connector and `kvcoder.job.*` show them.

export type JobRow = { id: string; kind: 'process' | 'subagent' | 'worker'; title: string; call: string; status: string; startedAt: string; endedAt?: string; exitCode?: number; staging?: { state: 'changed' | 'restored'; paths: number; headMoved: boolean } };
export type JobDetail = { row: JobRow; detail: Record<string, Json> };

/** Whether a run still goes on: running, or a helper waiting on the person (ADR 0085, 2). */
export const isActive = (status: string): boolean => status === 'running' || status === 'waiting';

/** How many of a process's last lines a read returns when it names no number. */
export const outputLines = 100;

async function subagentRow(ctx: Ctx, entry: Stored<BackgroundDoc>): Promise<JobDetail> {
  const store = records(ctx.store);
  const child = await store.sessions.get(entry.ref);
  const [turn] = await store.turns.find({ sessionId: entry.ref }, { limit: 1, order: 'desc' });
  const outcome = turn?.outcome ?? null;
  const waits = waitingFor(turn);
  const status = child === undefined || outcome === null ? (waits.length > 0 ? 'waiting' : 'running') : outcome === 'done' ? 'succeeded' : outcome === 'cancelled' ? 'cancelled' : 'failed';
  const row: JobRow = { id: entry.ref, kind: 'subagent', title: child?.title ?? entry.call, call: entry.call, status, startedAt: entry.startedAt, ...(turn?.endedAt === null || turn === undefined ? {} : { endedAt: turn.endedAt }) };
  const progress = await helperProgress(ctx, entry.ref, turn);
  const output = outcome === null ? {} : { output: (await childResult(ctx, entry.ref, outcome)).text };
  return { row, detail: { ...output, progress, ...(waits.length === 0 ? {} : { waitingFor: waits }) } };
}

async function processRow(ctx: Ctx, id: string, sessionId: string, lines: number): Promise<JobDetail | undefined> {
  const doc = await sessionProcess(ctx, sessionId, id);
  if (doc === undefined) return undefined;
  const row: JobRow = { id: doc.id, kind: 'process', title: doc.title, call: doc.call, status: processStatus(doc), startedAt: doc.startedAt, ...(doc.endedAt === undefined ? {} : { endedAt: doc.endedAt }), ...(typeof doc.exitCode === 'number' ? { exitCode: doc.exitCode } : {}) };
  return { row, detail: { output: await outputTail(ctx, doc.id, lines) } };
}

// A program worker's run (ADR 0021, 33): its output is what the call returned, once it has ended.
function runRow(run: Stored<RunDoc>): JobDetail {
  const row: JobRow = { id: run.id, kind: 'worker', title: run.worker, call: run.call, status: run.status, startedAt: run.startedAt, ...(run.endedAt === null ? {} : { endedAt: run.endedAt }), ...(run.exitCode === null ? {} : { exitCode: run.exitCode }), ...(run.staging === null ? {} : { staging: { state: run.staging.restored ? 'restored' as const : 'changed' as const, paths: run.staging.paths, headMoved: run.staging.headMoved } }) };
  return { row, detail: run.output === null ? {} : { output: run.output } };
}

/** One job of the session by its id, with its output or problem; `undefined` when the session started no such job. */
export async function jobDetail(ctx: Ctx, sessionId: string, id: string, lines = outputLines): Promise<JobDetail | undefined> {
  const process = await processRow(ctx, id, sessionId, lines);
  if (process !== undefined) return process;
  const run = await records(ctx.store).runs.get(id);
  if (run !== undefined) return run.sessionId === sessionId ? runRow(run) : undefined;
  const [entry] = await records(ctx.store).background.find({ sessionId, ref: id }, { limit: 1 });
  return entry === undefined || entry.kind !== 'subagent' ? undefined : subagentRow(ctx, entry);
}

const rowsShown = 50;

/** The session's jobs, newest first: every one still running, however old, and its newest ended ones to 50 rows in all (ADR 0057, 2). */
export async function jobRows(ctx: Ctx, sessionId: string): Promise<JobRow[]> {
  const store = records(ctx.store);
  const [entries, processes, runs] = await Promise.all([allDocs((options) => store.background.find({ sessionId }, options)), allDocs((options) => store.processes.find({ sessionId }, options)), allDocs((options) => store.runs.find({ sessionId }, options))]);
  const jobs = [...entries.map((entry) => ({ id: entry.ref, startedAt: entry.startedAt, ended: false })), ...processes.map((doc) => ({ id: doc.id, startedAt: doc.startedAt, ended: doc.end !== undefined })), ...runs.map((doc) => ({ id: doc.id, startedAt: doc.startedAt, ended: doc.status !== 'running' }))].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  // A subagent's state is its session's, so its row is read before it is known to have ended.
  const open = (await Promise.all(jobs.filter((job) => !job.ended).map((job) => jobDetail(ctx, sessionId, job.id)))).flatMap((job) => (job === undefined ? [] : [job.row]));
  const running = open.filter((row) => isActive(row.status));
  const ended = [...open.filter((row) => !isActive(row.status)), ...(await Promise.all(jobs.filter((job) => job.ended).slice(0, rowsShown).map((job) => jobDetail(ctx, sessionId, job.id)))).flatMap((job) => (job === undefined ? [] : [job.row]))];
  const kept = ended.sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, Math.max(rowsShown - running.length, 0));
  return [...running, ...kept].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

/** The chat's runs that are still running and that no turn waits on, as the agent is told of them (ADR 0068, 4). */
export async function runningInBackground(ctx: Ctx, sessionId: string): Promise<string[]> {
  const waitedOn = new Set((await allDocs((options) => records(ctx.store).runs.find({ sessionId }, options))).filter((run) => run.status === 'running' && run.toolCallId !== null).map((run) => run.id));
  return (await jobRows(ctx, sessionId)).filter((row) => isActive(row.status) && !waitedOn.has(row.id)).map((row) => `${row.id} (${row.kind}): ${row.title}`);
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
