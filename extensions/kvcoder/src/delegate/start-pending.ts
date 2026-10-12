import { ProblemError, type Ctx } from '@kvman/sdk';
import { startChild } from '../connectors/delegate.ts';
import { invalid } from '../problems.ts';
import { prepareGrants } from '../prompt/session-grants.ts';
import { delegationInTx, refusePending, waitingInTx, type CreationGuard, type PendingAuthority } from './permission.ts';
import { launchRun } from './runs.ts';

/** Parent grants, not child tool scope, authorize a newly published foreground resource. */
export async function startPending(ctx: Ctx, authority: PendingAuthority): Promise<void> {
  const { sessionId, pending } = authority;
  try {
    const prepared = await prepareGrants(ctx);
    const guard: CreationGuard = store => {
      ctx.job.signal.throwIfAborted();
      if (waitingInTx(store, authority) === undefined) throw invalid('The originating delegation is no longer current.');
      if (pending.kind === 'worker' && pending.runId !== null && pending.childSessionId === null && pending.questionId === null && pending.question === null) {
        const run = store.runs.get(pending.runId);
        if (run?.status !== 'running' || run.sessionId !== sessionId || run.toolCallId !== pending.toolCallId) throw invalid('The worker run is no longer current.');
        return delegationInTx(store, sessionId, prepared, run.worker, run.kind).session;
      }
      if (pending.kind === 'subagent' && pending.childSessionId !== null && pending.runId === null && pending.questionId === null && pending.question === null) {
        const child = store.sessions.get(pending.childSessionId);
        if (child?.parentId !== sessionId || child.worker === null || child === undefined) throw invalid('The child no longer belongs to its originating session.');
        return delegationInTx(store, sessionId, prepared, child.worker.name, 'subagent').session;
      }
      throw invalid('The delegation binding is invalid.');
    };
    if (pending.childSessionId !== null) await startChild(ctx, pending.childSessionId, guard);
    else if (pending.runId !== null) await launchRun(ctx, pending.runId, guard);
  } catch (error) {
    if (!(error instanceof ProblemError) || ctx.job.signal.aborted) throw error;
    await refusePending(ctx, authority, error);
    // Stale resources are retained for separately approved owned cleanup, not used to mutate a newer turn.
  }
}
