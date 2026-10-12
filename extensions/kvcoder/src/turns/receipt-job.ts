import { ProblemError, type Ctx, type Job } from '@kvman/sdk';
import type { AnswerReceiptDoc } from '../schemas/records.ts';
import { txRecords, type TxRecords } from '../store/collections.ts';
import { recoveryJobMatches } from './recover-workspace.ts';
import { boundRecoveryIntent, recoveryState } from './recovery-state.ts';

function receiptState(store: TxRecords, receipt: AnswerReceiptDoc) {
  const state = recoveryState(store, receipt.sessionId);
  return state?.turn.id === receipt.turnId && state.intent?.legacyJobId === null && boundRecoveryIntent(state) ? state : undefined;
}

/** Acknowledgment only: never recover, enqueue, cancel, notify or attach to a newer turn. */
export async function receiptJob(ctx: Ctx, receipt: AnswerReceiptDoc): Promise<string | null> {
  ctx.job.signal.throwIfAborted();
  const state = await ctx.store.transaction(tx => {
    ctx.job.signal.throwIfAborted();
    return receiptState(txRecords(tx), receipt);
  });
  const jobId = state?.session.stepJobId;
  if (state === undefined || jobId === null || jobId === undefined) return null;
  let job: Job;
  try { job = await ctx.exec('kernel.jobs.get', { id: jobId }); }
  catch (error) {
    ctx.job.signal.throwIfAborted();
    if (error instanceof ProblemError && error.problem.code === 'NOT_FOUND') return null;
    throw error;
  }
  ctx.job.signal.throwIfAborted();
  if (!recoveryJobMatches(state, job, ctx.job.workspace.id)) return null;
  return ctx.store.transaction(tx => {
    ctx.job.signal.throwIfAborted();
    const current = receiptState(txRecords(tx), receipt);
    if (current === undefined || current.session.stepIntentId !== state.session.stepIntentId || current.session.stepGeneration !== state.session.stepGeneration || current.session.stepJobId !== jobId) return null;
    return recoveryJobMatches(current, job, ctx.job.workspace.id) ? jobId : null;
  });
}
