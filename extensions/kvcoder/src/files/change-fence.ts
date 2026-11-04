import type { Ctx } from '@kvman/sdk';
import { invalid } from '../problems.ts';
import { deletingInTx } from '../sessions/execution-root.ts';
import type { TxRecords } from '../store/collections.ts';

// A stopped step changes nothing (ADR 0118, 5). A call's sync chain starts at its step's job, so `ctx.job.rootId` names
// the step: the session's `stepJobId` while it is the current one, and a step intent's `jobId` once it was. Checked in
// the change's own transaction, after the transaction that stopped the step, a late change can't land.

/** Refuses a change when its session is gone or being deleted, or when it comes from a step that is no longer current. */
export function requireCurrentStep(ctx: Ctx, store: TxRecords, sessionId: string, shown: string): void {
  const session = store.sessions.get(sessionId);
  const stopped = invalid('This step was stopped, so nothing was written.', { path: shown });
  if (session === undefined || deletingInTx(store, sessionId)) throw stopped;
  if (session.stepJobId === ctx.job.rootId) return;
  if (store.stepIntents.find({ sessionId, jobId: ctx.job.rootId }, { limit: 1 }).length > 0) throw stopped;
}
