import type { Ctx } from '@kvman/sdk';
import { records } from '../store/collections.ts';

// Who a chat waits on (plan 08 §8.1, ADR 0091, 6): the person, when its turn or one of its helpers waits on a question
// or an approval, whatever the chat's own status; its helpers, when its turn waits only on them or on programs' runs.

export type WaitingOn = 'person' | 'helpers' | null;

/** Each top-level chat of the workspace that waits on someone, by its id; one read of the waiting sessions. */
export async function waitingChats(ctx: Ctx): Promise<Map<string, 'person' | 'helpers'>> {
  const store = records(ctx.store);
  const found = new Map<string, 'person' | 'helpers'>();
  for (const session of await store.sessions.find({ status: 'waiting' }, { limit: 1000 })) {
    const turn = session.turnId === null ? undefined : await store.turns.get(session.turnId);
    const root = session.parentId ?? session.id;
    if (turn?.pending.some((item) => item.kind === 'question' || item.kind === 'approval') === true) found.set(root, 'person');
    else if (session.parentId === null && !found.has(root)) found.set(root, 'helpers');
  }
  return found;
}

/** Who one top-level chat waits on. */
export async function waitingOnOf(ctx: Ctx, sessionId: string): Promise<WaitingOn> {
  return (await waitingChats(ctx)).get(sessionId) ?? null;
}
