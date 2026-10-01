import type { Ctx } from '@kvman/sdk';
import { txRecords } from '../store/collections.ts';
import { endTurn } from './end-turn.ts';

// Cancel (plan 08 §8.1): the running step, the subagents the turn waits on, and the pending questions; then the
// session is idle. `--async` work goes on and still reports back. Resolves whether a turn was cancelled.
export async function cancelTurn(ctx: Ctx, sessionId: string, notice: boolean): Promise<boolean> {
  const found = await ctx.store.transaction((tx) => {
    const store = txRecords(tx);
    const session = store.sessions.get(sessionId);
    if (session === undefined || session.turnId === null) return undefined;
    const turn = store.turns.get(session.turnId);
    const children = (turn?.pending ?? []).flatMap((item) => (item.childSessionId === null ? [] : [item.childSessionId]));
    return { turnId: session.turnId, stepJobId: session.stepJobId, children };
  });
  if (found === undefined) return false;
  const ended = await endTurn(ctx, sessionId, found.turnId, 'cancelled', 'cancel', notice ? { code: 'CANCELLED' } : undefined);
  if (found.stepJobId !== null) await ctx.cancel(found.stepJobId);
  for (const child of found.children) await cancelTurn(ctx, child, false);
  return ended;
}
