import type { Ctx } from '@kvman/sdk';
import type { HeldResult } from '../schemas/records.ts';
import { now } from '../sessions/session-lookup.ts';
import { txRecords, type TxRecords } from '../store/collections.ts';
import { dispatchStep } from './start-turn.ts';
import { prepareStep, type StepIdentity } from './step-intents.ts';

// Resolving a pending call (plan 08 §8.1): its result is held in the turn; when the last one resolves, the session runs
// again and the next step appends every result in the model's call order before it calls the model.

/** Synchronous transition for callers that must commit additional records with this held result. */
export function resolvePendingInTx(store: TxRecords, sessionId: string, toolCallId: string, held: HeldResult): StepIdentity | null {
  const session = store.sessions.get(sessionId);
  if (session === undefined || session.turnId === null) return null;
  const turn = store.turns.get(session.turnId);
  if (session.status !== 'waiting' || turn?.sessionId !== sessionId || turn.outcome !== null || turn.endedAt !== null || !turn.pending.some(item => item.toolCallId === toolCallId)) return null;
  const pending = turn.pending.filter(item => item.toolCallId !== toolCallId);
  store.turns.update(turn.id, { pending, results: [...turn.results, held] });
  if (pending.length > 0) return null;
  store.sessions.update(sessionId, { status: 'running', updatedAt: now() });
  return prepareStep(store, sessionId, turn.id);
}

/** Holds a result for a pending call; resolves to the next step's job id when it was the last, else `null`. */
export async function resolvePending(ctx: Ctx, sessionId: string, toolCallId: string, held: HeldResult, follow: boolean): Promise<string | null> {
  const identity = await ctx.store.transaction(tx => resolvePendingInTx(txRecords(tx), sessionId, toolCallId, held));
  return identity === null ? null : dispatchStep(ctx, identity, follow);
}

/** A result that is plain text. */
export function heldText(toolCallId: string, text: string, isError: boolean): HeldResult {
  return { toolCallId, text, details: null, isError, run: null };
}
