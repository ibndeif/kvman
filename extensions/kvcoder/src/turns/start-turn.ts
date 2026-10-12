import type { Ctx, Stored } from '@kvman/sdk';
import { firePoint } from '../registry/session-points.ts';
import type { SessionDoc } from '../schemas/records.ts';
import { now } from '../sessions/session-lookup.ts';
import { txRecords, type TxRecords } from '../store/collections.ts';
import { noUsage } from './history.ts';
import { preparedStep, prepareStep, publishStep, type StepIdentity } from './step-intents.ts';

/** Opens a turn and prepares its first intent in the same transaction (ADR0041). */
export function openTurn(tx: TxRecords, session: Stored<SessionDoc>): string {
  const turn = tx.turns.insert({ sessionId: session.id, startedAt: now(), endedAt: null, durationMs: 0, steps: 0, lost: 0, incomplete: 0, usage: noUsage(), outcome: null, calls: [], pending: [], results: [], deferredCalls: [] });
  tx.sessions.update(session.id, { status: 'running', turnId: turn.id, stepJobId: null, updatedAt: now() });
  prepareStep(tx, session.id, turn.id);
  return turn.id;
}

/** Enqueues outside SQLite, then publishes only this exact identity; a losing candidate is cancelled. */
export async function dispatchStep(ctx: Ctx, identity: StepIdentity, follow: boolean): Promise<string | null> {
  ctx.job.signal.throwIfAborted();
  const current = await ctx.store.transaction(tx => {
    const found = preparedStep(txRecords(tx), identity.sessionId, identity.turnId);
    return found?.intentId === identity.intentId && found.generation === identity.generation;
  });
  if (!current) return null;
  const jobId = await ctx.execAsync('kvcoder.turn.step', identity);
  const publication = await ctx.store.transaction(tx => {
    const store = txRecords(tx);
    if (publishStep(store, identity, jobId)) return 'current';
    const intent = store.stepIntents.get(identity.intentId);
    // A canonical job can settle before its publisher returns. Its post-commit work is not a losing candidate.
    return intent?.sessionId === identity.sessionId && intent.turnId === identity.turnId && intent.generation === identity.generation && intent.phase === 'settled' && intent.jobId === jobId ? 'settled' : 'lost';
  });
  if (publication !== 'current') {
    if (publication === 'lost') await ctx.cancel(jobId);
    return null;
  }
  // A follow chunk is only a hint. Publication must win before it is emitted (ADR0041).
  if (follow) ctx.job.progress({ type: 'follow', jobId });
  return jobId;
}

/** Dispatches an already prepared transition; it never prepares a successor after the fact. */
export async function queueStep(ctx: Ctx, sessionId: string, turnId: string, follow: boolean): Promise<string | null> {
  const identity = await ctx.store.transaction(tx => preparedStep(txRecords(tx), sessionId, turnId));
  return identity === undefined ? null : dispatchStep(ctx, identity, follow);
}

/** Starts a committed turn: its point then its prepared first step, rechecked after the point. */
export async function beginTurn(ctx: Ctx, sessionId: string, turnId: string, follow: boolean): Promise<string | null> {
  await firePoint(ctx, 'kvcoder.turn.started', { sessionId, turnId });
  return queueStep(ctx, sessionId, turnId, follow);
}
