import type { Ctx, Stored } from '@kvman/sdk';
import { resultText } from '../result-text.ts';
import type { JsonValue } from '../connector-line.ts';
import { firePoint } from '../registry/session-points.ts';
import type { Outcome, SessionDoc } from '../schemas/records.ts';
import { now } from '../sessions/session-lookup.ts';
import { records, txRecords } from '../store/collections.ts';
import { appendBackground, backgroundText } from './background.ts';
import { appendNotice, appendQueued } from './history.ts';
import { textOf } from './model-context.ts';
import { heldText, resolvePending } from './resolve.ts';

// Ending a turn (plan 08 §8.1): the turn records its outcome and time, the session goes idle, and the `turn.ended`
// point fires. A subagent's end reaches its parent: its answer resolves the parent's pending call, or arrives as a
// background message. From kvcoder's job-point handlers nothing is queued, so an interrupted child ends its parent's
// turn too (ADR 0009, 95).

export type EndedBy = 'step' | 'handler' | 'cancel';

export type Notice = { code: string; params?: Record<string, JsonValue> };

export async function endTurn(ctx: Ctx, sessionId: string, turnId: string, outcome: Outcome, by: EndedBy, notice?: Notice): Promise<boolean> {
  const ended = await ctx.store.transaction((tx) => {
    const store = txRecords(tx);
    const session = store.sessions.get(sessionId);
    const turn = store.turns.get(turnId);
    if (session?.turnId !== turnId || turn === undefined || turn.outcome !== null) return undefined;
    const endedAt = now();
    const durationMs = Math.max(Date.parse(endedAt) - Date.parse(turn.startedAt), 0);
    store.turns.update(turnId, { endedAt, durationMs, outcome, calls: [], pending: [], results: [] });
    for (const question of store.questions.find({ sessionId }, { limit: 1000 })) store.questions.delete(question.id);
    appendQueued(store, session, null);
    if (notice !== undefined) appendNotice(store, session, notice.code, notice.params ?? {}, turnId);
    const updated = store.sessions.update(sessionId, { status: 'idle', turnId: null, stepJobId: null, endedTurns: session.endedTurns + 1, durationMs: session.durationMs + durationMs, updatedAt: endedAt });
    return { session: updated, usage: turn.usage, durationMs };
  });
  if (ended === undefined) return false;
  await firePoint(ctx, 'kvcoder.turn.ended', { sessionId, turnId, outcome, usage: ended.usage, durationMs: ended.durationMs });
  if (ended.session.parentId === null && ended.session.autoTitle && ended.session.endedTurns === 1) await ctx.execAsync('kvcoder.session.title', { sessionId });
  if (ended.session.parentId !== null && by !== 'cancel') await childEnded(ctx, ended.session, outcome, by, notice);
  return true;
}

async function lastAnswer(ctx: Ctx, sessionId: string): Promise<string> {
  const [answer] = await records(ctx.store).messages.find({ sessionId, kind: 'assistant' }, { limit: 1, order: 'desc' });
  return answer === undefined ? '' : textOf(answer.content['content']);
}

/** What a finished subagent returns (ADR 0009, 102). */
export async function childResult(ctx: Ctx, childId: string, outcome: Outcome): Promise<{ text: string; isError: boolean }> {
  const answer = await lastAnswer(ctx, childId);
  return outcome === 'done' ? { text: resultText(answer, 0), isError: false } : { text: resultText(`subagent ended ${outcome}\n${answer}`, 1), isError: true };
}

async function childEnded(ctx: Ctx, child: Stored<SessionDoc>, outcome: Outcome, by: EndedBy, notice: Notice | undefined): Promise<void> {
  const store = records(ctx.store);
  const parent = child.parentId === null ? undefined : await store.sessions.get(child.parentId);
  if (parent === undefined) return;
  const turn = parent.turnId === null ? undefined : await store.turns.get(parent.turnId);
  const waiting = turn?.pending.find((item) => item.childSessionId === child.id);
  if (waiting !== undefined && turn !== undefined) {
    if (by === 'handler') {
      await endTurn(ctx, parent.id, turn.id, outcome === 'interrupted' ? 'interrupted' : 'failed', 'handler', notice);
      return;
    }
    const result = await childResult(ctx, child.id, outcome);
    await resolvePending(ctx, parent.id, waiting.toolCallId, heldText(waiting.toolCallId, result.text, result.isError), false);
    return;
  }
  const [entry] = await store.background.find({ sessionId: parent.id, ref: child.id }, { limit: 1 });
  if (entry === undefined) return;
  const result = await childResult(ctx, child.id, outcome);
  await appendBackground(ctx, parent.id, { kind: 'subagent', sessionId: child.id }, backgroundText(entry.call, child.id, result.text), by === 'step');
}
