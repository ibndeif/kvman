import type { Stored } from '@kvman/sdk';
import type { JsonValue } from '../connector-call.ts';
import type { Outcome, SessionDoc, Usage } from '../schemas/records.ts';
import { now } from '../sessions/session-lookup.ts';
import type { TxRecords } from '../store/collections.ts';
import { appendEndingInTx, backgroundText } from './background.ts';
import { childResultInTx } from './child-result.ts';
import { appendEndedCalls } from './ended-calls.ts';
import { appendNotice, appendQueued } from './history.ts';
import { heldText, resolvePendingInTx } from './resolve.ts';
import type { StepLease } from './step-claim.ts';
import { invalidateStep, liveStep, prepareStep, settleStep, type StepIdentity } from './step-intents.ts';

export type EndedBy = 'step' | 'handler' | 'cancel';
export type Notice = { code: string; params?: Record<string, JsonValue> };
export type EndAuthority = StepLease | { jobId: string };
/** What a child's end gave its parent in the same transaction, for the caller to act on after the commit (ADR 0052, 2). */
export type Delivery = { step: StepIdentity } | { turn: { sessionId: string; turnId: string } } | { ended: EndedTurn };
export type EndedTurn = {
  session: Stored<SessionDoc>; turnId: string; outcome: Outcome; by: EndedBy; notice: Notice | undefined; usage: Usage; durationMs: number;
  stepJobId: string | null; stepIdentity: StepIdentity | undefined; children: string[]; runs: string[]; delivery: Delivery | undefined;
};

// A child's result reaches its parent with its end: the call that waits on it, a background message, or, for a child
// whose step was interrupted, the end of the parent's turn (ADR 0009, 95). A cancelled child tells no one.
function deliverChild(store: TxRecords, child: Stored<SessionDoc>, outcome: Outcome, by: EndedBy, notice: Notice | undefined): Delivery | undefined {
  const parent = child.parentId === null ? undefined : store.sessions.get(child.parentId);
  if (parent === undefined) return undefined;
  const turn = parent.turnId === null ? undefined : store.turns.get(parent.turnId);
  const waiting = turn?.pending.find(item => item.childSessionId === child.id);
  if (waiting !== undefined && turn !== undefined) {
    if (by === 'handler') {
      const ended = endTurnState(store, parent.id, turn.id, outcome === 'interrupted' ? 'interrupted' : 'failed', 'handler', notice);
      return ended === undefined ? undefined : { ended };
    }
    const result = childResultInTx(store, child.id, outcome);
    const step = resolvePendingInTx(store, parent.id, waiting.toolCallId, heldText(waiting.toolCallId, result.text, result.isError));
    return step === null ? undefined : { step };
  }
  const [entry] = store.background.find({ sessionId: parent.id, ref: child.id }, { limit: 1 });
  if (entry === undefined) return undefined;
  const turnId = appendEndingInTx(store, parent.id, { kind: 'subagent', sessionId: child.id }, backgroundText(entry.call, child.id, childResultInTx(store, child.id, outcome).text), by === 'step');
  return turnId === undefined ? undefined : { turn: { sessionId: parent.id, turnId } };
}

/** Commits terminal state and a child's delivery to its parent; cancellation, points and enqueueing remain outside SQLite. */
export function endTurnState(store: TxRecords, sessionId: string, turnId: string, outcome: Outcome, by: EndedBy, notice?: Notice, authority?: EndAuthority): EndedTurn | undefined {
  const session = store.sessions.get(sessionId);
  const turn = store.turns.get(turnId);
  if (session?.turnId !== turnId || turn?.sessionId !== sessionId || turn.outcome !== null || turn.endedAt !== null) return undefined;
  if (authority !== undefined && session.stepJobId !== authority.jobId) return undefined;
  if (by === 'step' && (authority === undefined || !('intentId' in authority))) return undefined;
  if (authority !== undefined && 'intentId' in authority) {
    if (authority.sessionId !== sessionId || authority.turnId !== turnId || liveStep(store, authority, authority.jobId) === undefined) return undefined;
    if (!settleStep(store, authority, authority.jobId)) return undefined;
  }
  // Preserve a legacy saved reference before terminal state clears it, even when later ownership cannot be proved.
  const identity = session.stepIntentId !== null ? { sessionId, turnId, intentId: session.stepIntentId, generation: session.stepGeneration } : by === 'cancel' && session.status === 'running' && session.stepJobId !== null && turn.pending.length === 0 ? prepareStep(store, sessionId, turnId, session.stepJobId) : undefined;
  const invalidatedJob = identity === undefined || (authority !== undefined && 'intentId' in authority) ? null : invalidateStep(store, identity, by === 'cancel' ? 'CANCEL_REQUESTED' : 'TURN_ENDED');
  const stepJobId = session.stepJobId ?? invalidatedJob;
  const children = turn.pending.flatMap(item => item.childSessionId === null ? [] : [item.childSessionId]);
  const runs = turn.pending.flatMap(item => item.runId === null ? [] : [item.runId]);
  const endedAt = now();
  const durationMs = Math.max(Date.parse(endedAt) - Date.parse(turn.startedAt), 0);
  appendEndedCalls(store, session, turn, outcome);
  store.turns.update(turnId, { endedAt, durationMs, outcome, calls: [], pending: [], results: [], deferredCalls: [] });
  for (const question of store.questions.find({ sessionId }, { limit: 1000 })) store.questions.delete(question.id);
  appendQueued(store, session, null);
  if (notice !== undefined) appendNotice(store, session, notice.code, notice.params ?? {}, turnId);
  const updated = store.sessions.update(sessionId, { status: 'idle', turnId: null, stepJobId: null, stepIntentId: null, endedTurns: session.endedTurns + 1, durationMs: session.durationMs + durationMs, updatedAt: endedAt });
  const delivery = by === 'cancel' ? undefined : deliverChild(store, updated, outcome, by, notice);
  return { session: updated, turnId, outcome, by, notice, usage: turn.usage, durationMs, stepJobId, stepIdentity: identity, children, runs, delivery };
}
