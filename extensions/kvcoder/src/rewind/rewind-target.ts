import type { Ctx, Stored } from '@kvman/sdk';
import { ownerName } from '../jobs/process-records.ts';
import { invalid } from '../problems.ts';
import type { MessageDoc, SessionDoc } from '../schemas/records.ts';
import { ownSession } from '../sessions/session-lookup.ts';
import { records } from '../store/collections.ts';
import { blockOf } from '../turns/history.ts';
import { messagesBefore } from '../turns/message-blocks.ts';

// The message a rewind goes back to (ADR 0118, 6): Edit takes one the person typed, Undo the latest one the person
// typed or a slash command's extension sent; a helper's chat is for reading.

/** The message rewound to: its `seq`, and its time for records from before ADR 0118. */
export type Mark = { seq: number; createdAt: string };

/** Whether a record was made after the message: by its `atSeq`, or for an older record by its time. */
export function isAfter(atSeq: number | null | undefined, at: string, mark: Mark): boolean {
  return atSeq === null || atSeq === undefined ? at > mark.createdAt : atSeq > mark.seq;
}

const typed = (message: MessageDoc): boolean => message.kind === 'user' && message.source?.kind === 'user';
const undoable = (message: MessageDoc): boolean => typed(message) || (message.kind === 'user' && message.source?.kind === 'extension' && message.source.name !== ownerName);

/** The chat a rewind works on: a top-level session. */
export async function rewoundChat(ctx: Ctx, sessionId: string): Promise<Stored<SessionDoc>> {
  const session = await ownSession(ctx, sessionId);
  if (session.parentId !== null) throw invalid("A helper's chat is for reading; edit or undo in its chat.", { sessionId });
  return session;
}

async function messageAt(ctx: Ctx, chat: Stored<SessionDoc>, seq: number): Promise<Stored<MessageDoc> | undefined> {
  const block = await records(ctx.store).messages.find({ sessionId: chat.id, block: blockOf(seq) }, { limit: 1000 });
  return block.find((message) => message.seq === seq);
}

/** The message the person typed at `seq`, for an edit. */
export async function editedMessage(ctx: Ctx, chat: Stored<SessionDoc>, seq: number): Promise<Stored<MessageDoc>> {
  const message = await messageAt(ctx, chat, seq);
  if (message === undefined || !typed(message)) throw invalid(`Message ${String(seq)} isn't one the person typed in this chat, so it can't be edited.`, { seq });
  return message;
}

/** The message at `seq` when it may be edited or undone, for the preview. */
export async function rewindableMessage(ctx: Ctx, chat: Stored<SessionDoc>, seq: number): Promise<Stored<MessageDoc>> {
  const message = await messageAt(ctx, chat, seq);
  if (message === undefined || !undoable(message)) throw invalid(`Message ${String(seq)} isn't one the person or a slash command sent in this chat.`, { seq });
  return message;
}

/** The latest message the person typed or a slash command sent, for an undo. */
export async function undoneMessage(ctx: Ctx, chat: Stored<SessionDoc>): Promise<Stored<MessageDoc>> {
  for (let page = await messagesBefore(ctx, chat.id, 200, chat.nextSeq); page.length > 0; page = await messagesBefore(ctx, chat.id, 200, page[0]?.seq ?? 0)) {
    const found = page.findLast(undoable);
    if (found !== undefined) return found;
  }
  throw invalid('This chat has no message to undo.', { sessionId: chat.id });
}
