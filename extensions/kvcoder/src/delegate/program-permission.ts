import { isDeepStrictEqual } from 'node:util';
import { ProblemError, type Ctx } from '@kvman/sdk';
import { invalid } from '../problems.ts';
import { prepareGrants } from '../prompt/session-grants.ts';
import { txRecords } from '../store/collections.ts';
import { delegationInTx, refusePending, waitingInTx, type PendingAuthority } from './permission.ts';
import { finishRun } from './runs.ts';
import { errorOutput } from '../connector-call.ts';

/** A queued job has no step lease. Existing foreground membership proves only its current waiting call. */
export async function programPermission(ctx: Ctx, runId: string) {
  const captured = await ctx.store.transaction(tx => {
    const store = txRecords(tx), run = store.runs.get(runId);
    if (run?.status !== 'running') return undefined;
    const session = store.sessions.get(run.sessionId), turn = session?.turnId === null || session === undefined ? undefined : store.turns.get(session.turnId);
    const pending = turn?.pending.find(item => item.runId === runId && item.toolCallId === run.toolCallId);
    const authority: PendingAuthority | undefined = turn === undefined || pending === undefined ? undefined : { sessionId: run.sessionId, turnId: turn.id, pending };
    return { run, authority };
  });
  if (captured === undefined) return undefined;
  const { authority } = captured;
  try {
    const prepared = await prepareGrants(ctx);
    return await ctx.store.transaction(tx => {
      ctx.job.signal.throwIfAborted();
      const store = txRecords(tx), run = store.runs.get(runId);
      if (run?.status !== 'running') return undefined;
      if (run.jobId !== null && run.jobId !== ctx.job.id) return undefined;
      if (run.sessionId !== captured.run.sessionId || run.toolCallId !== captured.run.toolCallId || run.worker !== captured.run.worker || run.kind !== captured.run.kind || run.command !== captured.run.command || !isDeepStrictEqual(run.args, captured.run.args) || run.timeoutMs !== captured.run.timeoutMs) throw invalid('The worker run changed before execution.');
      if (run.toolCallId !== null) {
        const pending = authority?.pending;
        if (authority === undefined || pending?.kind !== 'worker' || pending.runId !== runId || pending.childSessionId !== null || pending.questionId !== null || pending.question !== null || waitingInTx(store, authority) === undefined) throw invalid('The originating delegation is no longer current.');
      }
      delegationInTx(store, run.sessionId, prepared, run.worker, run.kind);
      return run;
    });
  } catch (error) {
    if (!(error instanceof ProblemError) || ctx.job.signal.aborted) throw error;
    if (authority !== undefined) await refusePending(ctx, authority, error);
    else if (captured.run.toolCallId === null) await finishRun(ctx, runId, { status: 'failed', exitCode: null, text: errorOutput(error.problem).output, isError: true }, true);
    return undefined;
  }
}
