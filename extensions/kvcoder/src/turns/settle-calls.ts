import type { Ctx, Stored } from '@kvman/sdk';
import { dropRun } from '../delegate/runs.ts';
import { startPending } from '../delegate/start-pending.ts';
import { firePoint } from '../registry/session-points.ts';
import type { HeldResult, JsonValue, Pending, SessionDoc, TurnDoc } from '../schemas/records.ts';
import { now } from '../sessions/session-lookup.ts';
import { records, txRecords, type TxRecords } from '../store/collections.ts';
import { appendMessage, appendQueued } from './history.ts';
import type { CallOutcome, ToolCall } from './run-calls.ts';
import type { StepLease } from './step-claim.ts';
import { liveStep, settleStep } from './step-intents.ts';
import { advanceStep, dispatchNext } from './step-next.ts';

// After a reply's calls (plan 08 §8.2): with nothing pending, the results are appended in the model's call order and
// the next step is queued; otherwise the session waits, holding the results so far, its questions recorded in the same
// transaction so an answer always finds them.

type Calls = TurnDoc['calls'];

// A result's details without a second copy of its output (ADR 0034, 7): the output stays only where it differs from the
// text the model gets, which is a shell line's and a binary's.
function storedDetails(held: HeldResult): JsonValue {
  const details = held.details;
  if (typeof details !== 'object' || details === null || Array.isArray(details) || details['output'] !== held.text) return details;
  return Object.fromEntries(Object.entries(details).filter(([name]) => name !== 'output'));
}

/** Appends a step's results as toolResult messages, in the model's call order. */
export function appendResults(store: TxRecords, session: Stored<SessionDoc>, turnId: string, calls: Calls, results: readonly HeldResult[]): void {
  for (const call of calls) {
    const held = results.find((candidate) => candidate.toolCallId === call.toolCallId);
    if (held === undefined) continue;
    const content: Record<string, JsonValue> = { role: 'toolResult', toolCallId: call.toolCallId, toolName: call.toolName, content: [{ type: 'text', text: held.text }], isError: held.isError, timestamp: Date.now() };
    appendMessage(store, session, { kind: 'toolResult', content: held.details === null ? content : { ...content, details: storedDetails(held) }, turnId });
  }
}

function pendingOf(store: TxRecords, sessionId: string, rootSessionId: string, turnId: string, toolCallId: string, outcome: Exclude<CallOutcome, { kind: 'result' | 'deferred' }>): Pending {
  if (outcome.kind === 'subagent') return { toolCallId, kind: 'subagent', questionId: null, question: null, childSessionId: outcome.childSessionId, runId: null };
  if (outcome.kind === 'worker') return { toolCallId, kind: 'worker', questionId: null, question: null, childSessionId: null, runId: outcome.runId };
  const question = store.questions.insert({ sessionId, rootSessionId, turnId, toolCallId, kind: outcome.questionKind, question: outcome.question });
  const shown = outcome.questionKind === 'approval' ? outcome.question : { kind: outcome.questionKind, ...outcome.question };
  return { toolCallId, kind: outcome.questionKind === 'approval' ? 'approval' : 'question', questionId: question.id, question: shown, childSessionId: null, runId: null };
}

export async function settleCalls(ctx: Ctx, lease: StepLease, calls: readonly ToolCall[], outcomes: readonly CallOutcome[], maxSteps: number | null): Promise<void> {
  const { sessionId, turnId } = lease;
  const order: Calls = calls.map((call) => ({ toolCallId: call.id, toolName: call.name }));
  const held = outcomes.flatMap((outcome) => (outcome.kind === 'result' ? [outcome.held] : []));
  if (held.length === outcomes.length) {
    const next = await ctx.store.transaction((tx) => {
      const store = txRecords(tx);
      const found = liveStep(store, lease, lease.jobId);
      if (found === undefined) return undefined;
      appendResults(store, found.session, turnId, order, held);
      appendQueued(store, found.session, turnId);
      return advanceStep(store, lease, maxSteps);
    });
    await dispatchNext(ctx, next);
    return;
  }
  const rootSessionId = (await rootOf(ctx, sessionId)) ?? sessionId;
  const pending = await ctx.store.transaction((tx) => {
    const store = txRecords(tx);
    if (liveStep(store, lease, lease.jobId) === undefined) return undefined;
    const items = outcomes.flatMap((outcome, index) => (outcome.kind === 'result' || outcome.kind === 'deferred' ? [] : [pendingOf(store, sessionId, rootSessionId, turnId, calls[index]?.id ?? '', outcome)]));
    // Effects held back behind an approval wait with the turn, and run in the model's order when it resumes (ADR 0046).
    const deferredCalls = outcomes.flatMap((outcome, index) => (outcome.kind === 'deferred' ? [{ toolCallId: calls[index]?.id ?? '', call: outcome.call }] : []));
    store.turns.update(turnId, { calls: order, pending: items, results: held, deferredCalls });
    settleStep(store, lease, lease.jobId);
    store.sessions.update(sessionId, { status: 'waiting', stepJobId: null, stepIntentId: null, updatedAt: now() });
    return items;
  });
  if (pending === undefined) {
    await dropNewRuns(ctx, outcomes);
    return;
  }
  for (const item of pending) {
    const current = await ctx.store.transaction(tx => {
      const store = txRecords(tx);
      return store.sessions.get(sessionId)?.turnId === turnId && store.turns.get(turnId)?.pending.some(saved => saved.toolCallId === item.toolCallId);
    });
    if (!current) continue;
    if (item.questionId !== null) ctx.job.progress({ type: 'component', component: 'kvcoder.question', props: { questionId: item.questionId, sessionId, pending: item } });
    if (item.childSessionId !== null || item.runId !== null) await startPending(ctx, { sessionId, turnId, pending: item });
  }
  for (const kind of new Set(pending.map((item) => item.kind))) await firePoint(ctx, 'kvcoder.session.waiting', { sessionId, kind });
}

// The runs recorded for a turn that ended meanwhile never start.
async function dropNewRuns(ctx: Ctx, outcomes: readonly CallOutcome[]): Promise<void> {
  for (const outcome of outcomes) {
    const run = outcome.kind === 'worker' ? await records(ctx.store).runs.get(outcome.runId) : undefined;
    if (run !== undefined) await dropRun(ctx, run);
  }
}

async function rootOf(ctx: Ctx, sessionId: string): Promise<string | null> {
  const session = await records(ctx.store).sessions.get(sessionId);
  return session?.parentId ?? null;
}
