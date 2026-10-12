import type { Stored } from '@kvman/sdk';
import { invalid } from '../problems.ts';
import type { SessionDoc, StepIntentDoc, TurnDoc } from '../schemas/records.ts';
import { now } from '../sessions/session-lookup.ts';
import type { TxRecords } from '../store/collections.ts';
import { endTurnState } from './end-turn-state.ts';
import { preparedStep, type StepIdentity } from './step-intents.ts';

export type RecoveryState = { session: Stored<SessionDoc>; turn: Stored<TurnDoc>; intent: Stored<StepIntentDoc> | undefined };

/** An open runnable turn remains a candidate even when its stored ownership cannot be proved. */
export function recoveryState(store: TxRecords, sessionId: string): RecoveryState | undefined {
  const session = store.sessions.get(sessionId);
  if (session?.status !== 'running' || session.turnId === null) return undefined;
  const turn = store.turns.get(session.turnId);
  if (turn?.sessionId !== sessionId || turn.outcome !== null || turn.endedAt !== null || turn.pending.length > 0) return undefined;
  return { session, turn, intent: session.stepIntentId === null ? undefined : store.stepIntents.get(session.stepIntentId) };
}

export function boundRecoveryIntent(state: RecoveryState): boolean {
  const { intent, session, turn } = state;
  return intent !== undefined && intent.id === session.stepIntentId && intent.sessionId === session.id && intent.turnId === turn.id && intent.generation === session.stepGeneration && (intent.phase === 'prepared' || intent.phase === 'claimed') && session.stepJobId === intent.jobId && (intent.phase !== 'claimed' || intent.jobId !== null);
}

export function preparedRecovery(state: RecoveryState): boolean {
  return boundRecoveryIntent(state) && state.intent?.phase === 'prepared' && state.intent.legacyJobId === null;
}

export function recoveryJobId(state: RecoveryState): string | null {
  const { intent, session, turn } = state;
  return intent?.sessionId === session.id && intent.turnId === turn.id ? intent.jobId ?? intent.legacyJobId ?? session.stepJobId : session.stepJobId;
}

/** Metadata was awaited outside SQLite. Recheck every ownership field before using that observation. */
function unchanged(store: TxRecords, expected: RecoveryState): RecoveryState | undefined {
  const current = recoveryState(store, expected.session.id);
  if (current === undefined || current.turn.id !== expected.turn.id || current.session.stepGeneration !== expected.session.stepGeneration || current.session.stepIntentId !== expected.session.stepIntentId || current.session.stepJobId !== expected.session.stepJobId) return undefined;
  if (current.intent?.id !== expected.intent?.id || current.intent?.sessionId !== expected.intent?.sessionId || current.intent?.turnId !== expected.intent?.turnId || current.intent?.generation !== expected.intent?.generation || current.intent?.phase !== expected.intent?.phase || current.intent?.jobId !== expected.intent?.jobId || current.intent?.legacyJobId !== expected.intent?.legacyJobId) return undefined;
  return current;
}

/** Only modern prepared work has durable proof of no claimed effects. Never cancel an unverified job. */
export function retryPrepared(store: TxRecords, expected: RecoveryState): StepIdentity | undefined {
  const current = unchanged(store, expected);
  if (current === undefined || !preparedRecovery(current) || current.intent === undefined) return undefined;
  const updatedAt = now();
  store.stepIntents.update(current.intent.id, { jobId: null, updatedAt });
  store.sessions.update(current.session.id, { stepJobId: null, updatedAt });
  return preparedStep(store, current.session.id, current.turn.id);
}

/** Retain ALL owned unsettled references for this turn; a foreign pointer is never write authority. */
function retainUncertain(store: TxRecords, current: RecoveryState): void {
  const { session, turn } = current;
  let after: string | undefined, hasTracking = false, savedTracked = session.stepJobId === null;
  for (;;) {
    const page = store.stepIntents.find({ sessionId: session.id, turnId: turn.id }, { limit: 1000, ...(after === undefined ? {} : { after }) });
    for (const intent of page) {
      if (intent.phase !== 'prepared' && intent.phase !== 'claimed') continue;
      hasTracking = true;
      if (intent.jobId === session.stepJobId || intent.legacyJobId === session.stepJobId) savedTracked = true;
      store.stepIntents.update(intent.id, { phase: 'needs-review', reason: 'STEP_EFFECTS_UNKNOWN', updatedAt: now() });
    }
    if (page.length < 1000) break;
    after = page[page.length - 1]?.id;
  }
  if (hasTracking && savedTracked) return;
  // Diagnostics never acquire executable authority, including under deleting or broken ancestry.
  // Legacy saved references retain their legacy slot; unprovable modern candidates are not fabricated claims.
  const legacy = session.stepIntentId === null, generation = session.stepGeneration + 1;
  if (!Number.isSafeInteger(generation)) throw invalid('The next step generation exceeds the safe integer range.');
  const stamp = now();
  const intent = store.stepIntents.insert({ sessionId: session.id, turnId: turn.id, generation,
    phase: 'needs-review', jobId: legacy ? null : session.stepJobId, legacyJobId: legacy ? session.stepJobId : null,
    reason: 'STEP_EFFECTS_UNKNOWN', createdAt: stamp, updatedAt: stamp });
  store.sessions.update(session.id, { stepGeneration: generation, stepIntentId: intent.id, stepJobId: null, updatedAt: stamp });
}

/** Retain uncertain bindings and end interrupted atomically, without effects or replay. */
export function interruptUncertain(store: TxRecords, expected: RecoveryState, code: string) {
  const current = unchanged(store, expected);
  if (current === undefined) return undefined;
  retainUncertain(store, current);
  const ended = endTurnState(store, current.session.id, current.turn.id, 'interrupted', 'handler', { code: 'INTERRUPTED', params: { code } });
  if (ended === undefined) throw invalid('The uncertain step must end in its current turn transaction.');
  return ended;
}
