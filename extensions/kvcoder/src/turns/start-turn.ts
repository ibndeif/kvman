import type { Ctx, Stored } from '@kvman/sdk';
import { firePoint } from '../registry/session-points.ts';
import type { SessionDoc } from '../schemas/records.ts';
import { now } from '../sessions/session-lookup.ts';
import { records, txRecords, type TxRecords } from '../store/collections.ts';
import { noUsage } from './history.ts';

// Starting a turn and chaining its steps (plan 08 §8.1): each step is an async job; the session records the running
// step's job id, and the step that queues the next one sends `{ type: 'follow', jobId }` so the UI streams on.

/** Opens a turn on an idle session inside a transaction, and marks the session running. */
export function openTurn(tx: TxRecords, session: Stored<SessionDoc>): string {
  const turn = tx.turns.insert({ sessionId: session.id, startedAt: now(), endedAt: null, durationMs: 0, steps: 0, lost: 0, usage: noUsage(), outcome: null, calls: [], pending: [], results: [] });
  tx.sessions.update(session.id, { status: 'running', turnId: turn.id, stepJobId: null, updatedAt: now() });
  return turn.id;
}

/** Queues the turn's next step and records it as the session's step; `follow` sends the follow chunk. */
export async function queueStep(ctx: Ctx, sessionId: string, turnId: string, follow: boolean): Promise<string> {
  const jobId = await ctx.execAsync('kvcoder.turn.step', { sessionId, turnId });
  if (follow) ctx.job.progress({ type: 'follow', jobId });
  await ctx.store.transaction((tx) => {
    const { sessions } = txRecords(tx);
    const session = sessions.get(sessionId);
    if (session?.turnId === turnId && session.status === 'running') sessions.update(sessionId, { stepJobId: jobId });
  });
  return jobId;
}

/** Starts a turn that `openTurn` opened: the `turn.started` point, then the first step. */
export async function beginTurn(ctx: Ctx, sessionId: string, turnId: string, follow: boolean): Promise<string> {
  await firePoint(ctx, 'kvcoder.turn.started', { sessionId, turnId });
  return queueStep(ctx, sessionId, turnId, follow);
}

/** The session's turn, when it is still the running one. */
export async function currentTurn(ctx: Ctx, sessionId: string, turnId: string) {
  const store = records(ctx.store);
  const session = await store.sessions.get(sessionId);
  if (session?.turnId !== turnId) return undefined;
  const turn = await store.turns.get(turnId);
  return turn === undefined || turn.outcome !== null ? undefined : { session, turn };
}
