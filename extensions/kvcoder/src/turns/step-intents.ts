import type { Stored } from '@kvman/sdk';
import { invalid } from '../problems.ts';
import type { SessionDoc, StepIntentDoc, TurnDoc } from '../schemas/records.ts';
import { now } from '../sessions/session-lookup.ts';
import { deletingInTx, executionRootInTx } from '../sessions/execution-root.ts';
import type { TxRecords } from '../store/collections.ts';

/** The private identity of one scheduled step (ADR0041); never a public session DTO. */
export type StepIdentity = { sessionId: string; turnId: string; intentId: string; generation: number };

type LiveIntent = { session: Stored<SessionDoc>; turn: Stored<TurnDoc>; intent: Stored<StepIntentDoc> };

/** All identity checks happen again in the transaction that writes state. */
function liveIntent(store: TxRecords, expected: StepIdentity, teardown = false): LiveIntent | undefined {
  const session = store.sessions.get(expected.sessionId);
  if (session?.turnId !== expected.turnId || session.status !== 'running' || session.stepIntentId !== expected.intentId || session.stepGeneration !== expected.generation) return undefined;
  if (!teardown && deletingInTx(store, expected.sessionId)) return undefined;
  const turn = store.turns.get(expected.turnId);
  const intent = store.stepIntents.get(expected.intentId);
  if (turn?.sessionId !== expected.sessionId || turn.outcome !== null || turn.endedAt !== null || intent?.sessionId !== expected.sessionId || intent.turnId !== expected.turnId || intent.generation !== expected.generation) return undefined;
  return { session, turn, intent };
}

/** Reads only the current runnable prepared identity, never manufactures an intent outside its state transition. */
export function preparedStep(store: TxRecords, sessionId: string, turnId: string): StepIdentity | undefined {
  const session = store.sessions.get(sessionId);
  if (session?.stepIntentId === null || session === undefined) return undefined;
  const identity = { sessionId, turnId, intentId: session.stepIntentId, generation: session.stepGeneration };
  const live = liveIntent(store, identity);
  return live?.intent.phase === 'prepared' && live.turn.pending.length === 0 ? identity : undefined;
}

/** Prepares a new intent in the transaction that makes its turn runnable. No enqueue occurs here. */
export function prepareStep(store: TxRecords, sessionId: string, turnId: string, legacyJobId: string | null = null): StepIdentity {
  const session = store.sessions.get(sessionId);
  const turn = store.turns.get(turnId);
  if (session?.turnId !== turnId || session.status !== 'running' || turn?.sessionId !== sessionId || turn.outcome !== null || turn.endedAt !== null || turn.pending.length > 0) throw invalid('A step needs its current runnable turn.');
  // A saved legacy reference can still be retained and immediately invalidated by terminal cleanup.
  if (legacyJobId === null && executionRootInTx(store, sessionId) === undefined) throw invalid('A step needs its current runnable turn.');
  if (session.stepIntentId !== null) throw invalid('The current step intent must be settled or invalidated before preparing its successor.');
  const generation = session.stepGeneration + 1;
  if (!Number.isSafeInteger(generation)) throw invalid('The next step generation exceeds the safe integer range.');
  const timestamp = now();
  const intent = store.stepIntents.insert({ sessionId, turnId, generation, phase: 'prepared', jobId: null, legacyJobId, reason: null, createdAt: timestamp, updatedAt: timestamp });
  store.sessions.update(sessionId, { stepGeneration: generation, stepIntentId: intent.id, stepJobId: null, updatedAt: timestamp });
  return { sessionId, turnId, intentId: intent.id, generation };
}

/** Binds the one winner before model, approval or ordinary tool effects. Repeated claims lose. */
export function claimStep(store: TxRecords, expected: StepIdentity, jobId: string): LiveIntent | undefined {
  const live = liveIntent(store, expected);
  if (live === undefined || live.intent.phase !== 'prepared' || live.turn.pending.length > 0) return undefined;
  // A published candidate is already selected; before publication the first valid claimant may win.
  if (live.intent.jobId !== null && live.intent.jobId !== jobId) return undefined;
  if (live.intent.legacyJobId !== null && live.intent.legacyJobId !== jobId) return undefined;
  const updatedAt = now();
  const intent = store.stepIntents.update(expected.intentId, { phase: 'claimed', jobId, updatedAt });
  const session = store.sessions.update(expected.sessionId, { stepJobId: jobId, updatedAt });
  return { session, turn: live.turn, intent };
}

/** Selects a published candidate, or confirms the already claimed winner; never replaces another. */
export function publishStep(store: TxRecords, expected: StepIdentity, jobId: string): boolean {
  const live = liveIntent(store, expected);
  if (live === undefined) return false;
  if (live.intent.phase === 'claimed') return live.intent.jobId === jobId && live.session.stepJobId === jobId;
  if (live.intent.phase !== 'prepared' || live.turn.pending.length > 0) return false;
  if (live.intent.legacyJobId !== null && live.intent.legacyJobId !== jobId) return false;
  if (live.intent.jobId !== null) return live.intent.jobId === jobId && live.session.stepJobId === jobId;
  const updatedAt = now();
  store.stepIntents.update(expected.intentId, { jobId, updatedAt });
  store.sessions.update(expected.sessionId, { stepJobId: jobId, updatedAt });
  return true;
}

/** A step-derived write needs the current identity and its canonical job, not merely the same turn. */
export function liveStep(store: TxRecords, expected: StepIdentity, jobId: string): LiveIntent | undefined {
  const live = liveIntent(store, expected);
  return live?.intent.phase === 'claimed' && live.intent.jobId === jobId && live.session.stepJobId === jobId ? live : undefined;
}

/** Use in the SAME transaction as results and waiting/end/successor state, never as a separate settlement. */
export function settleStep(store: TxRecords, expected: StepIdentity, jobId: string): boolean {
  if (liveStep(store, expected, jobId) === undefined) return false;
  store.stepIntents.update(expected.intentId, { phase: 'settled', updatedAt: now() });
  store.sessions.update(expected.sessionId, { stepIntentId: null, stepJobId: null });
  return true;
}

/** Invalidates only the expected identity; step-derived callers also validate their canonical job in this transaction. */
export function invalidateStep(store: TxRecords, expected: StepIdentity, reason: 'CANCEL_REQUESTED' | 'TURN_ENDED'): string | null {
  const live = liveIntent(store, expected, true);
  if (live === undefined || (live.intent.phase !== 'prepared' && live.intent.phase !== 'claimed')) return null;
  store.stepIntents.update(expected.intentId, { phase: 'invalidated', reason, updatedAt: now() });
  store.sessions.update(expected.sessionId, { stepIntentId: null, stepJobId: null });
  // A verified legacy job is known even when publication and claim have not happened yet.
  return live.intent.jobId ?? live.intent.legacyJobId;
}
