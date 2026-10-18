import { isDeepStrictEqual } from 'node:util';
import { ProblemError, type Ctx, type Stored } from '@kvman/sdk';
import { delegateRunSchema } from '../connectors/delegate.ts';
import { errorOutput } from '../connector-call.ts';
import { invalid } from '../problems.ts';
import { prepareGrants } from '../prompt/session-grants.ts';
import { firePoint } from '../registry/session-points.ts';
import type { QuestionDoc, RunCallDoc } from '../schemas/records.ts';
import { records, txRecords, type TxRecords } from '../store/collections.ts';
import { heldText, resolvePendingInTx } from '../turns/resolve.ts';
import { dispatchStep } from '../turns/start-turn.ts';
import { delegationInTx, refusePending, waitingInTx, type PendingAuthority } from './permission.ts';
import { recordRun } from './runs.ts';
import { startBackgroundRun } from './start-background.ts';
import { startPending } from './start-pending.ts';
import { availableWorker, isProgram } from './workers.ts';

// Positive delegate approval remains legacy/receipt-free: existing fields do not prove durable launch (ADR0044).
type Approved = { question: Stored<QuestionDoc>; call: RunCallDoc };

export const isDelegateRun = (call: RunCallDoc): boolean => call.connector === 'delegate' && call.command === 'run';

function approvalAuthority(question: Stored<QuestionDoc>): PendingAuthority {
  return { sessionId: question.sessionId, turnId: question.turnId, pending: { toolCallId: question.toolCallId, kind: 'approval', questionId: question.id, question: question.question, childSessionId: null, runId: null } };
}

function currentApproval(store: TxRecords, approved: Approved, authority: PendingAuthority) {
  const found = waitingInTx(store, authority);
  return found === undefined || !isDeepStrictEqual(store.questions.get(approved.question.id), approved.question) ? undefined : found;
}

async function refuseApproval(ctx: Ctx, approved: Approved, authority: PendingAuthority, error: unknown): Promise<string | null> {
  if (!(error instanceof ProblemError) || ctx.job.signal.aborted) throw error;
  const identity = await ctx.store.transaction(tx => {
    const store = txRecords(tx);
    if (currentApproval(store, approved, authority) === undefined) return null;
    store.questions.delete(approved.question.id);
    return resolvePendingInTx(store, authority.sessionId, authority.pending.toolCallId, heldText(authority.pending.toolCallId, errorOutput(error.problem).output, true));
  });
  return identity === null ? null : dispatchStep(ctx, identity, false);
}

/** Prepares asynchronously, then consumes only the exact approval alongside run creation/pending replacement. */
export async function startApprovedRun(ctx: Ctx, approved: Approved): Promise<string | null> {
  const { question, call } = approved, { sessionId, toolCallId } = question;
  const payload = delegateRunSchema.parse(call.payload), authority = approvalAuthority(question);
  const background = payload.background === true;
  let run;
  try {
    const session = await records(ctx.store).sessions.get(sessionId);
    const worker = await availableWorker(ctx, session?.checks ?? null, payload.worker);
    if (!isProgram(worker)) throw invalid(`The worker ${worker.name} changed while the call waited. Make the call again.`);
    const prepared = await prepareGrants(ctx);
    run = await ctx.store.transaction(tx => {
      ctx.job.signal.throwIfAborted();
      const store = txRecords(tx), found = currentApproval(store, approved, authority);
      if (found === undefined) return undefined;
      delegationInTx(store, sessionId, prepared, worker.name, worker.kind);
      const saved = recordRun(store, sessionId, worker, payload, background ? null : toolCallId);
      store.questions.delete(question.id);
      if (!background) store.turns.update(question.turnId, { pending: found.turn.pending.map(item => item.toolCallId === toolCallId ? { toolCallId, kind: 'worker' as const, questionId: null, question: null, childSessionId: null, runId: saved.id } : item) });
      return saved;
    });
  } catch (error) { return refuseApproval(ctx, approved, authority, error); }
  if (run === undefined) return null;
  if (!background) {
    await startPending(ctx, { sessionId, turnId: question.turnId, pending: { toolCallId, kind: 'worker', questionId: null, question: null, childSessionId: null, runId: run.id } });
    await firePoint(ctx, 'kvcoder.session.waiting', { sessionId, kind: 'worker' });
    return null;
  }
  try {
    await startBackgroundRun(ctx, run, async () => {
      const prepared = await prepareGrants(ctx);
      return store => {
        ctx.job.signal.throwIfAborted();
        if (waitingInTx(store, authority) === undefined) throw invalid('The originating approval is no longer current.');
        return delegationInTx(store, sessionId, prepared, run.worker, run.kind).session;
      };
    }, store => waitingInTx(store, authority) !== undefined);
  } catch (error) {
    if (!(error instanceof ProblemError) || ctx.job.signal.aborted) throw error;
    return refusePending(ctx, authority, error);
  }
  const text = `started ${run.id}`;
  const identity = await ctx.store.transaction(tx => {
    const store = txRecords(tx);
    return waitingInTx(store, authority) === undefined ? null : resolvePendingInTx(store, sessionId, toolCallId, { toolCallId, text, isError: false, run: null, details: { connector: call.connector, command: call.command, output: text, durationMs: 0 } });
  });
  return identity === null ? null : dispatchStep(ctx, identity, false);
}
