import type { Ctx, Stored } from '@kvman/sdk';
import type { SessionDoc } from '../schemas/records.ts';
import { now } from '../sessions/session-lookup.ts';
import { txRecords, type TxRecords } from '../store/collections.ts';
import { blockOf } from '../turns/history.ts';
import { isAfter, type Mark } from './rewind-target.ts';

// The chat's records of a rewind (ADR 0118, 1), in one transaction: the message and every message after it, every
// queued message, the turns opened after it with their questions, what was made after it (artifacts, the map, the
// pieces of a long file), the chat's views of files, and the background rows of the helpers that go. The marks of
// cleared and collapsed messages move back below the message; `nextSeq` stays, so no `seq` is used twice.

const pageSize = 1000;

// Every document `find` gives inside the transaction, in pages.
function everyInTx<Doc extends { id: string }>(find: (after: string | undefined) => Doc[]): Doc[] {
  const found: Doc[] = [];
  for (let page = find(undefined); page.length > 0; page = find(found.at(-1)?.id)) {
    found.push(...page);
    if (page.length < pageSize) break;
  }
  return found;
}

const paged = (after: string | undefined) => ({ limit: pageSize, ...(after === undefined ? {} : { after }) });

function dropMessages(store: TxRecords, chat: Stored<SessionDoc>, mark: Mark): number {
  let removed = 0;
  for (let block = blockOf(mark.seq); block <= blockOf(Math.max(chat.nextSeq - 1, 0)); block += 1) {
    for (const message of store.messages.find({ sessionId: chat.id, block }, { limit: pageSize })) {
      if (message.seq < mark.seq) continue;
      store.messages.delete(message.id);
      removed += 1;
    }
  }
  for (const queued of everyInTx((after) => store.queued.find({ sessionId: chat.id }, paged(after)))) store.queued.delete(queued.id);
  return removed;
}

function dropTurns(store: TxRecords, chatId: string, mark: Mark): void {
  const gone = new Set<string>();
  for (const turn of everyInTx((after) => store.turns.find({ sessionId: chatId }, paged(after)))) {
    if (!isAfter(turn.atSeq, turn.startedAt, mark)) continue;
    store.turns.delete(turn.id);
    gone.add(turn.id);
  }
  for (const question of everyInTx((after) => store.questions.find({ sessionId: chatId }, paged(after)))) if (gone.has(question.turnId)) store.questions.delete(question.id);
}

function dropMade(store: TxRecords, chatId: string, sessions: readonly string[], mark: Mark): void {
  for (const artifact of everyInTx((after) => store.artifacts.find({ sessionId: chatId }, paged(after)))) if (isAfter(artifact.atSeq, artifact.createdAt, mark)) store.artifacts.delete(artifact.id);
  for (const map of store.maps.find({ sessionId: chatId }, { limit: pageSize })) if (isAfter(map.atSeq, map.createdAt, mark)) store.maps.delete(map.id);
  for (const sessionId of sessions) {
    for (const part of everyInTx((after) => store.fileParts.find({ sessionId }, paged(after)))) if (isAfter(part.atSeq, part.updatedAt, mark)) store.fileParts.delete(part.id);
  }
  for (const view of everyInTx((after) => store.fileViews.find({ sessionId: chatId }, paged(after)))) store.fileViews.delete(view.id);
}

/** A mark of cleared or collapsed messages, moved back below `seq`. */
export const markBelow = (value: number | null, seq: number): number | null => (value === null || value < seq ? value : seq > 0 ? seq - 1 : null);

/** Deletes the chat's records from the message on, and says how many stored messages went. */
export function dropRecords(ctx: Ctx, chatId: string, sessions: readonly string[], mark: Mark, helpers: readonly string[]): Promise<number> {
  return ctx.store.transaction((tx) => {
    const store = txRecords(tx);
    const chat = store.sessions.get(chatId);
    if (chat === undefined) throw ctx.problem('kvcoder/SESSION_NOT_FOUND', { sessionId: chatId });
    const removed = dropMessages(store, chat, mark);
    dropTurns(store, chatId, mark);
    dropMade(store, chatId, sessions, mark);
    const gone = new Set(helpers);
    for (const row of everyInTx((after) => store.background.find({ sessionId: chatId }, paged(after)))) if (gone.has(row.ref)) store.background.delete(row.id);
    store.sessions.update(chatId, { clearedThroughSeq: markBelow(chat.clearedThroughSeq, mark.seq), collapsedThroughSeq: markBelow(chat.collapsedThroughSeq, mark.seq), updatedAt: now() });
    return removed;
  });
}
