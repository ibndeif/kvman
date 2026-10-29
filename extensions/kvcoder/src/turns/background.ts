import type { Ctx } from '@kvman/sdk';
import type { Source } from '../schemas/records.ts';
import { now } from '../sessions/session-lookup.ts';
import { txRecords, type TxRecords } from '../store/collections.ts';
import { appendMessage, userContent } from './history.ts';
import { endingReadInTx } from './read-endings.ts';
import { beginTurn, openTurn } from './start-turn.ts';

// Background results (ADR 0009, 89): a `user` message the next step reads. It starts a turn only when the session is
// idle and `startTurn` allows; while a step runs or the session waits, it is queued and dismisses nothing.

/** The text a background result reaches the model with. */
export function backgroundText(call: string, ref: string, result: string): string {
  return `The background call \`${call}\` (job ${ref}) finished:\n${result}`;
}

/** Appends or queues the result in the caller's transaction; gives the turn it opened, for the caller to begin after its commit. */
export function appendBackgroundInTx(store: TxRecords, sessionId: string, source: Source, text: string, startTurn: boolean): string | undefined {
  const session = store.sessions.get(sessionId);
  if (session === undefined) return undefined;
  if (session.status !== 'idle') {
    store.queued.insert({ sessionId, source, text, fileIds: null, fileNames: null, createdAt: now() });
    return undefined;
  }
  appendMessage(store, session, { kind: 'user', content: userContent(text), source });
  return startTurn ? openTurn(store, session) : undefined;
}

export async function appendBackground(ctx: Ctx, sessionId: string, source: Source, text: string, startTurn: boolean): Promise<void> {
  const turnId = await ctx.store.transaction((tx) => appendBackgroundInTx(txRecords(tx), sessionId, source, text, startTurn));
  if (turnId !== undefined) await beginTurn(ctx, sessionId, turnId, true);
}

/** A run's ending, appended or queued as a background result unless the agent already read it (ADR 0108, 7). */
export function appendEndingInTx(store: TxRecords, sessionId: string, source: Source, text: string, startTurn: boolean): string | undefined {
  return endingReadInTx(store, sessionId, source) ? undefined : appendBackgroundInTx(store, sessionId, source, text, startTurn);
}

export async function appendEnding(ctx: Ctx, sessionId: string, source: Source, text: string, startTurn: boolean): Promise<void> {
  const turnId = await ctx.store.transaction((tx) => appendEndingInTx(txRecords(tx), sessionId, source, text, startTurn));
  if (turnId !== undefined) await beginTurn(ctx, sessionId, turnId, true);
}
