import type { Ctx, Stored } from '@kvman/sdk';
import { startChild } from '../calls/subagent.ts';
import { firePoint } from '../registry/session-points.ts';
import type { HeldResult, JsonValue, Pending, SessionDoc, TurnDoc } from '../schemas/records.ts';
import { now } from '../sessions/session-lookup.ts';
import { records, txRecords, type TxRecords } from '../store/collections.ts';
import { endTurn } from './end-turn.ts';
import { appendMessage, appendQueued } from './history.ts';
import type { CallOutcome, ToolCall } from './run-calls.ts';
import { queueStep } from './start-turn.ts';

// After a reply's calls (plan 08 §8.2): with nothing pending, the results are appended in the model's call order and
// the next step is queued; otherwise the session waits, holding the results so far, its questions recorded in the same
// transaction so an answer always finds them.

type Calls = TurnDoc['calls'];

/** Appends a step's results as toolResult messages, in the model's call order. */
export function appendResults(store: TxRecords, session: Stored<SessionDoc>, turnId: string, calls: Calls, results: readonly HeldResult[]): void {
  for (const call of calls) {
    const held = results.find((candidate) => candidate.toolCallId === call.toolCallId);
    if (held === undefined) continue;
    const content: Record<string, JsonValue> = { role: 'toolResult', toolCallId: call.toolCallId, toolName: call.toolName, content: [{ type: 'text', text: held.text }], isError: held.isError, timestamp: Date.now() };
    appendMessage(store, session, { kind: 'toolResult', content: held.details === null ? content : { ...content, details: held.details }, turnId });
  }
}

/** The running turn inside a transaction, if `turnId` still is it. */
export function liveTurn(store: TxRecords, sessionId: string, turnId: string): { session: Stored<SessionDoc>; turn: Stored<TurnDoc> } | undefined {
  const session = store.sessions.get(sessionId);
  const turn = store.turns.get(turnId);
  if (session?.turnId !== turnId || turn === undefined || turn.outcome !== null) return undefined;
  return { session, turn };
}

/** Queues the next step, or ends the turn at `kvcoder.maxSteps` (ADR 0009, 102). */
export async function continueTurn(ctx: Ctx, sessionId: string, turnId: string, maxSteps: number): Promise<void> {
  const turn = await records(ctx.store).turns.get(turnId);
  if (turn !== undefined && turn.steps >= maxSteps) await endTurn(ctx, sessionId, turnId, 'maxSteps', 'step', { code: 'MAX_STEPS', params: { steps: maxSteps } });
  else await queueStep(ctx, sessionId, turnId, true);
}

function pendingOf(store: TxRecords, sessionId: string, rootSessionId: string, turnId: string, toolCallId: string, outcome: Exclude<CallOutcome, { kind: 'result' }>): Pending {
  if (outcome.kind === 'subagent') return { toolCallId, kind: 'subagent', questionId: null, question: null, childSessionId: outcome.childSessionId };
  const question = store.questions.insert({ sessionId, rootSessionId, turnId, toolCallId, kind: outcome.questionKind, question: outcome.question });
  const shown = outcome.questionKind === 'approval' ? outcome.question : { kind: outcome.questionKind, ...outcome.question };
  return { toolCallId, kind: outcome.questionKind === 'approval' ? 'approval' : 'question', questionId: question.id, question: shown, childSessionId: null };
}

export async function settleCalls(ctx: Ctx, sessionId: string, turnId: string, calls: readonly ToolCall[], outcomes: readonly CallOutcome[], maxSteps: number): Promise<void> {
  const order: Calls = calls.map((call) => ({ toolCallId: call.id, toolName: call.name }));
  const held = outcomes.flatMap((outcome) => (outcome.kind === 'result' ? [outcome.held] : []));
  if (held.length === outcomes.length) {
    const live = await ctx.store.transaction((tx) => {
      const store = txRecords(tx);
      const found = liveTurn(store, sessionId, turnId);
      if (found === undefined) return false;
      appendResults(store, found.session, turnId, order, held);
      appendQueued(store, found.session, turnId);
      return true;
    });
    if (live) await continueTurn(ctx, sessionId, turnId, maxSteps);
    return;
  }
  const rootSessionId = (await rootOf(ctx, sessionId)) ?? sessionId;
  const pending = await ctx.store.transaction((tx) => {
    const store = txRecords(tx);
    if (liveTurn(store, sessionId, turnId) === undefined) return undefined;
    const items = outcomes.flatMap((outcome, index) => (outcome.kind === 'result' ? [] : [pendingOf(store, sessionId, rootSessionId, turnId, calls[index]?.id ?? '', outcome)]));
    store.turns.update(turnId, { calls: order, pending: items, results: held });
    store.sessions.update(sessionId, { status: 'waiting', stepJobId: null, updatedAt: now() });
    return items;
  });
  if (pending === undefined) return;
  for (const item of pending) {
    if (item.questionId !== null) ctx.job.progress({ type: 'component', component: 'kvcoder.question', props: { questionId: item.questionId, sessionId, pending: item } });
    if (item.childSessionId !== null) await startChild(ctx, item.childSessionId);
  }
  for (const kind of new Set(pending.map((item) => item.kind))) await firePoint(ctx, 'kvcoder.session.waiting', { sessionId, kind });
}

async function rootOf(ctx: Ctx, sessionId: string): Promise<string | null> {
  const session = await records(ctx.store).sessions.get(sessionId);
  return session?.parentId ?? null;
}
