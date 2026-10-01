import type { Ctx, Stored } from '@kvman/sdk';
import type { MessageDoc } from '../schemas/records.ts';
import { records } from '../store/collections.ts';
import { blockOf } from './history.ts';

// Reading a session's history by blocks of `seq`, in order.

async function block(ctx: Ctx, sessionId: string, index: number): Promise<Stored<MessageDoc>[]> {
  return (await records(ctx.store).messages.find({ sessionId, block: index }, { limit: 1000 })).sort((first, second) => first.seq - second.seq);
}

/** The messages from `fromSeq` on, in order. */
export async function messagesFrom(ctx: Ctx, sessionId: string, fromSeq: number, nextSeq: number): Promise<Stored<MessageDoc>[]> {
  const found: Stored<MessageDoc>[] = [];
  for (let index = blockOf(fromSeq); index <= blockOf(Math.max(nextSeq - 1, 0)); index += 1) found.push(...(await block(ctx, sessionId, index)).filter((message) => message.seq >= fromSeq && message.seq < nextSeq));
  return found;
}

/** The newest `limit` messages, in order. */
export async function newestMessages(ctx: Ctx, sessionId: string, limit: number, nextSeq: number): Promise<Stored<MessageDoc>[]> {
  const found: Stored<MessageDoc>[] = [];
  for (let index = blockOf(Math.max(nextSeq - 1, 0)); index >= 0 && found.length < limit; index -= 1) found.unshift(...(await block(ctx, sessionId, index)));
  return found.slice(Math.max(found.length - limit, 0));
}

/** The latest summary, if the session has one. */
export async function latestSummary(ctx: Ctx, sessionId: string): Promise<Stored<MessageDoc> | undefined> {
  return (await records(ctx.store).messages.find({ sessionId, kind: 'summary' }, { limit: 1, order: 'desc' }))[0];
}
