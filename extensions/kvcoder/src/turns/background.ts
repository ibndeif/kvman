import type { Ctx } from '@kvman/sdk';
import type { Source } from '../schemas/records.ts';
import { now } from '../sessions/session-lookup.ts';
import { txRecords } from '../store/collections.ts';
import { appendMessage, userContent } from './history.ts';
import { beginTurn, openTurn } from './start-turn.ts';

// Background results (ADR 0009, 89): a `user` message the next step reads. It starts a turn only when the session is
// idle and `startTurn` allows; while a step runs or the session waits, it is queued and dismisses nothing.

/** The text a background result reaches the model with. */
export function backgroundText(call: string, ref: string, result: string): string {
  return `The background call \`${call}\` (job ${ref}) finished:\n${result}`;
}

export async function appendBackground(ctx: Ctx, sessionId: string, source: Source, text: string, startTurn: boolean): Promise<void> {
  const turnId = await ctx.store.transaction((tx) => {
    const store = txRecords(tx);
    const session = store.sessions.get(sessionId);
    if (session === undefined) return undefined;
    if (session.status !== 'idle') {
      store.queued.insert({ sessionId, source, text, fileIds: null, fileNames: null, createdAt: now() });
      return undefined;
    }
    appendMessage(store, session, { kind: 'user', content: userContent(text), source });
    return startTurn ? openTurn(store, session) : undefined;
  });
  if (turnId !== undefined) await beginTurn(ctx, sessionId, turnId, true);
}
