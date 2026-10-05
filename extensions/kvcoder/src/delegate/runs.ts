import type { Ctx, Stored } from '@kvman/sdk';
import type { HeldResult, RunDoc } from '../schemas/records.ts';
import { now } from '../sessions/session-lookup.ts';
import { records, txRecords } from '../store/collections.ts';
import { appendBackground, backgroundText } from '../turns/background.ts';
import { heldText, resolvePending } from '../turns/resolve.ts';
import { commandLine } from './programs.ts';
import type { ProgramWorker } from './workers.ts';

// The runs of program workers (plan 08 §8.5, ADR 0021, 11 and 33 to 35). A run is recorded with the command line it
// starts with, then run by its own async job; whoever ends it first (the job, a stop, or a lost job) records how, and
// tells the chat: the turn that waits on it gets its result, and a background run a message.

export type RunEnd = { status: Exclude<RunDoc['status'], 'running'>; exitCode: number | null; text: string; isError: boolean };

/** Records a run of `worker` on `task`; `toolCallId` is the call that waits on it, or `null` for a background run. */
export async function createRun(ctx: Ctx, sessionId: string, worker: ProgramWorker, call: { description: string; task: string }, toolCallId: string | null): Promise<Stored<RunDoc>> {
  const line = commandLine(worker, call.task);
  return records(ctx.store).runs.insert({ sessionId, toolCallId, worker: worker.name, kind: worker.kind, call: call.description, command: line.command, args: line.args, timeoutMs: worker.timeoutMs, jobId: null, status: 'running', startedAt: now(), endedAt: null, exitCode: null, output: null });
}

/** Queues the job that runs a recorded run. */
export async function launchRun(ctx: Ctx, runId: string): Promise<void> {
  const jobId = await ctx.execAsync('kvcoder.delegate.worker.run', { runId });
  await records(ctx.store).runs.update(runId, { jobId });
}

// Records how a run ended, once: `undefined` when something else ended it first.
async function markEnded(ctx: Ctx, runId: string, end: RunEnd): Promise<Stored<RunDoc> | undefined> {
  return ctx.store.transaction((tx) => {
    const { runs } = txRecords(tx);
    const run = runs.get(runId);
    if (run === undefined || run.status !== 'running') return undefined;
    return runs.update(runId, { status: end.status, endedAt: now(), exitCode: end.exitCode, output: end.text });
  });
}

function heldRun(run: Stored<RunDoc>, toolCallId: string, end: RunEnd): HeldResult {
  const durationMs = Math.max(Date.now() - Date.parse(run.startedAt), 0);
  return { toolCallId, text: end.text, isError: end.isError, run: null, details: { description: run.call, connector: 'delegate', command: 'run', output: end.text, durationMs } };
}

/** Ends a run and gives its result to the call that waits on it, or to the chat as a background message, which may start a turn. */
export async function finishRun(ctx: Ctx, runId: string, end: RunEnd, startTurn: boolean): Promise<boolean> {
  const run = await markEnded(ctx, runId, end);
  if (run === undefined) return false;
  if (run.toolCallId !== null) await resolvePending(ctx, run.sessionId, run.toolCallId, heldRun(run, run.toolCallId, end), false);
  else await appendBackground(ctx, run.sessionId, { kind: 'job', jobId: run.id }, backgroundText(run.call, run.id, end.text), startTurn);
  return true;
}

async function cancelJobOf(ctx: Ctx, run: Stored<RunDoc>): Promise<void> {
  const jobId = run.jobId ?? (await records(ctx.store).runs.get(run.id))?.jobId ?? null;
  if (jobId !== null) await ctx.cancel(jobId);
}

/** Stops a run for the agent or the person: its result is that it was stopped (ADR 0021, 34). `false` for one that had ended. */
export async function stopRun(ctx: Ctx, run: Stored<RunDoc>): Promise<boolean> {
  const stopped = await finishRun(ctx, run.id, { status: 'cancelled', exitCode: null, text: `${run.worker} was stopped`, isError: true }, false);
  if (stopped) await cancelJobOf(ctx, run);
  return stopped;
}

/** Stops a run whose turn or chat is going away: nothing is told to anyone. */
export async function dropRun(ctx: Ctx, run: Stored<RunDoc>): Promise<void> {
  if ((await markEnded(ctx, run.id, { status: 'cancelled', exitCode: null, text: `${run.worker} was stopped`, isError: true })) !== undefined) await cancelJobOf(ctx, run);
}

/** Stops every run a session still has going, and forgets all of them (the chat is deleted). */
export async function dropRuns(ctx: Ctx, sessionId: string): Promise<void> {
  const store = records(ctx.store);
  for (const run of await store.runs.find({ sessionId }, { limit: 1000 })) {
    await dropRun(ctx, run);
    await store.runs.delete(run.id);
  }
}

/** A result that says why a run never started. */
export const refusedRun = (toolCallId: string, text: string): HeldResult => heldText(toolCallId, text, true);
