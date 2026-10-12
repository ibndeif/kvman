import { isDeepStrictEqual } from 'node:util';
import { ProblemError, type Ctx, type Stored } from '@kvman/sdk';
import { errorOutput } from '../connector-call.ts';
import { invalid } from '../problems.ts';
import { grantsInTx, prepareGrants, type GrantPreparation } from '../prompt/session-grants.ts';
import type { Pending, RunDoc, SessionDoc } from '../schemas/records.ts';
import { now } from '../sessions/session-lookup.ts';
import { txRecords, type TxRecords } from '../store/collections.ts';
import { heldText, resolvePendingInTx } from '../turns/resolve.ts';
import { dispatchStep } from '../turns/start-turn.ts';
import { liveStep } from '../turns/step-intents.ts';
import type { StepLease } from '../turns/step-claim.ts';
import type { Worker } from './workers.ts';

export type CreationGuard = (store: TxRecords) => Stored<SessionDoc>;
export type PendingAuthority = { sessionId: string; turnId: string; pending: Pending };

/** A waiting resource must still belong unambiguously to the exact originating open turn. */
export function waitingInTx(store: TxRecords, authority: PendingAuthority) {
  const { sessionId, turnId, pending } = authority;
  const session = store.sessions.get(sessionId), turn = store.turns.get(turnId);
  if (session?.status !== 'waiting' || session.turnId !== turnId || turn?.sessionId !== sessionId || turn.outcome !== null || turn.endedAt !== null) return undefined;
  const matches = turn.pending.filter(item => item.toolCallId === pending.toolCallId || (pending.runId !== null && item.runId === pending.runId) || (pending.childSessionId !== null && item.childSessionId === pending.childSessionId) || (pending.questionId !== null && item.questionId === pending.questionId));
  const calls = turn.calls.filter(call => call.toolCallId === pending.toolCallId);
  if (matches.length !== 1 || !isDeepStrictEqual(matches[0], pending) || calls.length !== 1 || calls[0]?.toolName !== 'run' || turn.results.some(item => item.toolCallId === pending.toolCallId)) return undefined;
  return { session, turn };
}

/** Captures only a well-formed exact foreground worker wait, never a call-ID-only match. */
export function runAuthorityInTx(store: TxRecords, run: Stored<RunDoc>): PendingAuthority | undefined {
  if (run.toolCallId === null) return undefined;
  const session = store.sessions.get(run.sessionId), turn = session?.turnId === null || session === undefined ? undefined : store.turns.get(session.turnId);
  const pending = turn?.pending.find(item => item.runId === run.id && item.toolCallId === run.toolCallId);
  if (turn === undefined || pending?.kind !== 'worker' || pending.childSessionId !== null || pending.questionId !== null || pending.question !== null) return undefined;
  const authority = { sessionId: run.sessionId, turnId: turn.id, pending };
  return waitingInTx(store, authority) === undefined ? undefined : authority;
}

/** Current parent grants and named worker presence; captured scope/instructions/argv are not regenerated. */
export function delegationInTx(store: TxRecords, sessionId: string, prepared: GrantPreparation, name: string, kind?: Worker['kind']) {
  const session = store.sessions.get(sessionId);
  const grants = session === undefined ? undefined : grantsInTx(store, session, prepared);
  if (grants === undefined) throw invalid('The session ancestry is no longer available.');
  const worker = grants.workers.find(item => item.name === name);
  if (worker === undefined) {
    const names = grants.workers.map(item => item.name);
    throw new ProblemError({ code: 'kvcoder/WORKER_NOT_FOUND', message: `There is no worker ${name}. ${names.length === 0 ? 'No worker is available.' : `The workers are: ${names.join(', ')}.`}`, params: { worker: name } });
  }
  if (!grants.names.includes('delegate')) throw invalid('There is no connector delegate. Make this call again when delegation is available.');
  if (kind !== undefined && worker.kind !== kind) throw invalid(`The worker ${name} changed while the call waited. Make the call again.`);
  return { session: grants.session, worker };
}

/** Preparation precedes the creation transaction, which rereads the canonical lease and stored grants. */
export async function creationGuard(ctx: Ctx, lease: StepLease, worker: Worker): Promise<CreationGuard> {
  const prepared = await prepareGrants(ctx);
  return store => {
    ctx.job.signal.throwIfAborted();
    if (ctx.job.id !== lease.jobId || liveStep(store, lease, lease.jobId) === undefined) throw invalid('The originating step is no longer current.');
    const current = delegationInTx(store, lease.sessionId, prepared, worker.name, worker.kind);
    if (worker.kind !== 'subagent' && current.worker.kind !== 'subagent' && current.worker.approval !== worker.approval) throw invalid('The worker approval requirement changed. Make this call again.');
    return current.session;
  };
}

/** Refuse only this still-current resource; never resolve a newer turn by tool-call ID alone. */
export async function refusePending(ctx: Ctx, authority: PendingAuthority, error: ProblemError): Promise<string | null> {
  const text = errorOutput(error.problem).output;
  const identity = await ctx.store.transaction(tx => {
    const store = txRecords(tx);
    if (waitingInTx(store, authority) === undefined) return null;
    const runId = authority.pending.runId, run = runId === null ? undefined : store.runs.get(runId);
    if (run !== undefined && run.status === 'running' && run.sessionId === authority.sessionId && run.toolCallId === authority.pending.toolCallId) store.runs.update(run.id, { status: 'failed', endedAt: now(), output: text });
    return resolvePendingInTx(store, authority.sessionId, authority.pending.toolCallId, heldText(authority.pending.toolCallId, text, true));
  });
  return identity === null ? null : dispatchStep(ctx, identity, false);
}
