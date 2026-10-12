import { z, type Ctx } from '@kvman/sdk';
import { records, txRecords } from '../store/collections.ts';
import { notifyEnded } from '../turns/end-turn.ts';
import { endTurnState } from '../turns/end-turn-state.ts';
import { checkCommand, runResult } from './programs.ts';
import { programFound, runProgram } from './run-program.ts';
import { finishRun } from './runs.ts';
import { stagingMark } from './git-staging.ts';
import { registerStagingRestore, stagingChange, stagingLines } from './staging-guard.ts';
import { programPermission } from './program-permission.ts';
import { runAuthorityInTx } from './permission.ts';
import { isProgram, listedWorker, listedWorkers, workerCheckName } from './workers.ts';

// The job that runs a program worker, and the check of its program (plan 08 §8.5, ADR 0021, 11, 35, and 37). The job
// is queued by a step or by an answer, never by a handler, so when the program exits it may hold the result and queue
// the next step, as a subagent's last step does for its parent.

/** The run's job may last for the longest time limit, with room to report it. */
const runOptions = { retries: 0, timeoutMs: 7_260_000 };

// A run whose job failed (ADR 0021, 35): the turn that waits on it ends as a failed step does, and a background run
// tells the chat. Nothing is queued from here, since a handler's jobs carry the `fromHandler` mark.
export async function runLost(ctx: Ctx, jobId: string, code: string): Promise<void> {
  const store = records(ctx.store);
  const [run] = await store.runs.find({ jobId }, { limit: 1 });
  if (run === undefined || run.status !== 'running') return;
  const interrupted = code === 'INTERRUPTED';
  const status = interrupted ? 'interrupted' : 'failed';
  const text = interrupted ? `${run.worker} was interrupted because kvman stopped.` : `${run.worker} failed: ${code}`;
  if (run.toolCallId === null) {
    await finishRun(ctx, run.id, { status, exitCode: null, text, isError: true }, false);
    return;
  }
  const ended = await ctx.store.transaction(tx => {
    const current = txRecords(tx), saved = current.runs.get(run.id);
    if (saved?.status !== 'running' || saved.jobId !== jobId || saved.sessionId !== run.sessionId || saved.toolCallId !== run.toolCallId) return undefined;
    const authority = runAuthorityInTx(current, saved);
    current.runs.update(saved.id, { status, endedAt: new Date().toISOString(), output: text });
    return authority === undefined ? undefined : endTurnState(current, authority.sessionId, authority.turnId, status, 'handler', { code: interrupted ? 'INTERRUPTED' : 'STEP_FAILED', params: { code } });
  });
  if (ended !== undefined) await notifyEnded(ctx, ended);
}

/** The checks of the workspace's program workers, as a session keeps them (ADR 0021, 37). */
export async function workerChecks(ctx: Ctx): Promise<{ name: string; passed: boolean }[]> {
  const programs = (await listedWorkers(ctx)).filter(isProgram);
  return Promise.all(programs.map(async (worker) => ({ name: workerCheckName(worker.name), passed: await programFound(checkCommand(worker.kind), ctx.job.workspace.path, ctx.job.signal) })));
}

export function registerWorkerRun(ctx: Ctx): void {
  registerStagingRestore(ctx);
  ctx.registerCommand('kvcoder.delegate.worker.run', {
    description: "Runs a program worker's program on its task, and gives the chat its answer.",
    input: z.strictObject({ runId: z.string() }),
    output: z.object({}),
    ...runOptions,
    handle: async ({ runId }) => {
      const run = await programPermission(ctx, runId);
      if (run === undefined) return {};
      ctx.job.signal.throwIfAborted();
      const folder = ctx.job.workspace.path;
      const before = await stagingMark(folder, ctx.job.signal);
      const end = await runProgram({ command: run.command, args: run.args }, folder, run.timeoutMs, ctx.job.signal);
      // A cancelled or interrupted job leaves the run to whoever stopped it, or to `kernel.job.failed`.
      ctx.job.signal.throwIfAborted();
      const result = runResult({ name: run.worker, kind: run.kind, timeoutMs: run.timeoutMs }, end);
      const staging = await stagingChange(folder, before, ctx.job.signal);
      const text = staging === undefined || before === undefined ? result.text : `${result.text}\n\n${stagingLines(staging, before)}`;
      await finishRun(ctx, runId, { status: result.isError ? 'failed' : 'succeeded', exitCode: end.timedOut ? null : end.exitCode, text, isError: result.isError, ...(staging === undefined ? {} : { staging }) }, true);
      return {};
    },
  });
  ctx.registerCommand('kvcoder.delegate.worker.check', {
    description: "Checks that a worker's program is installed; a subagent is always ready.",
    input: z.strictObject({ name: z.string() }),
    output: z.object({ status: z.enum(['ready', 'notFound']) }),
    public: true,
    retries: 0,
    handle: async ({ name }) => {
      const worker = await listedWorker(ctx, name);
      const found = !isProgram(worker) || (await programFound(checkCommand(worker.kind), ctx.job.workspace.path, ctx.job.signal));
      const status: 'ready' | 'notFound' = found ? 'ready' : 'notFound';
      return { status };
    },
  });
}
