import type { Ctx } from '@kvman/sdk';
import { dropRun } from '../delegate/runs.ts';
import { firePoint } from '../registry/session-points.ts';
import type { Outcome } from '../schemas/records.ts';
import { records, txRecords } from '../store/collections.ts';
import { closeTurnServers } from '../mcp/turn-servers.ts';
import { cancelStepJob } from './cancel-step-job.ts';
import { childResultInTx } from './child-result.ts';
import { endTurnState, type EndAuthority, type EndedBy, type EndedTurn, type Notice } from './end-turn-state.ts';
export type { EndedBy, Notice } from './end-turn-state.ts';
import { beginTurn, dispatchStep } from './start-turn.ts';

// Ending a turn (plan 08 §8.1): the turn records its outcome and time, the session goes idle, and the `turn.ended`
// point fires. A subagent's end reaches its parent in the transaction that ends it (ADR 0052, 2): its answer resolves
// the parent's pending call, or arrives as a background message, and an interrupted child ends its parent's turn too
// (ADR 0009, 95). What that started, and what the ended turn still waited on, is handled here after the commit.

export async function endTurn(ctx: Ctx, sessionId: string, turnId: string, outcome: Outcome, by: EndedBy, notice?: Notice, authority?: EndAuthority): Promise<boolean> {
  const ended = await ctx.store.transaction(tx => endTurnState(txRecords(tx), sessionId, turnId, outcome, by, notice, authority));
  if (ended === undefined) return false;
  await notifyEnded(ctx, ended);
  return true;
}

// The helpers and worker runs a turn still waited on when it ended go with it (ADR 0052, 4).
async function stopDependents(ctx: Ctx, ended: EndedTurn): Promise<void> {
  for (const child of ended.children) await cancelTurn(ctx, child, false);
  for (const runId of ended.runs) {
    const run = await records(ctx.store).runs.get(runId);
    if (run !== undefined) await dropRun(ctx, run);
  }
}

/** Effects for an already committed end; never used to decide whether a turn may end. */
export async function notifyEnded(ctx: Ctx, ended: EndedTurn): Promise<void> {
  const { turnId, outcome, session, delivery } = ended;
  await firePoint(ctx, 'kvcoder.turn.ended', { sessionId: session.id, turnId, outcome, usage: ended.usage, durationMs: ended.durationMs });
  if (session.parentId === null && session.autoTitle && session.endedTurns === 1) await ctx.execAsync('kvcoder.session.title', { sessionId: session.id });
  await stopDependents(ctx, ended);
  // The MCP servers the turn kept end with it (ADR 0108, 12).
  await closeTurnServers(ctx, turnId);
  if (delivery === undefined) return;
  if ('step' in delivery) await dispatchStep(ctx, delivery.step, false);
  else if ('turn' in delivery) await beginTurn(ctx, delivery.turn.sessionId, delivery.turn.turnId, true);
  else await notifyEnded(ctx, delivery.ended);
}

// Invalidate/end and capture the current owned jobs in one transaction. A late publisher loses and cancels its
// candidate; background policy remains unchanged. External cancellation and notifications are never in SQLite.
// With `only`, the turn is cancelled when it is still the session's current one, and left alone otherwise (ADR 0049, 1).
export async function cancelTurn(ctx: Ctx, sessionId: string, notice: boolean, only?: string): Promise<boolean> {
  const ended = await ctx.store.transaction(tx => {
    const store = txRecords(tx);
    const session = store.sessions.get(sessionId);
    return session?.turnId === null || session === undefined || (only !== undefined && session.turnId !== only) ? undefined : endTurnState(store, sessionId, session.turnId, 'cancelled', 'cancel', notice ? { code: 'CANCELLED' } : undefined);
  });
  if (ended === undefined) return false;
  await cancelStepJob(ctx, ended);
  await notifyEnded(ctx, ended);
  return true;
}

/** What a finished subagent returns, for the job list. */
export async function childResult(ctx: Ctx, childId: string, outcome: Outcome): Promise<{ text: string; isError: boolean }> {
  return ctx.store.transaction(tx => childResultInTx(txRecords(tx), childId, outcome));
}
