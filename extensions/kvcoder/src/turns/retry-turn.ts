import type { Ctx, Stored } from '@kvman/sdk';
import { invalid } from '../problems.ts';
import type { SessionDoc } from '../schemas/records.ts';
import { txRecords } from '../store/collections.ts';
import { beginTurn, openTurn } from './start-turn.ts';

// Retry (ADR 0050, 3): a turn that stopped runs again on the session's history as it stands. No message is added, so
// the chat and the model's context stay as the person left them.

const stopped = new Set(['STEP_FAILED', 'REPLY_LOST', 'REPLY_INCOMPLETE', 'INTERRUPTED']);

export async function retryTurn(ctx: Ctx, session: Stored<SessionDoc>): Promise<void> {
  const turnId = await ctx.store.transaction((tx) => {
    const store = txRecords(tx);
    const fresh = store.sessions.get(session.id);
    if (fresh === undefined) throw ctx.problem('kvcoder/SESSION_NOT_FOUND', { sessionId: session.id });
    const [last] = store.messages.find({ sessionId: session.id }, { limit: 1, order: 'desc' });
    if (fresh.status !== 'idle' || last?.kind !== 'notice' || !stopped.has(String(last.content['code']))) throw invalid("Only a chat whose last turn stopped can be retried.", { sessionId: session.id });
    return openTurn(store, fresh);
  });
  await beginTurn(ctx, session.id, turnId, true);
}
