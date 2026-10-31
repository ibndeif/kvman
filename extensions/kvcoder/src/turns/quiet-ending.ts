import type { Stored } from '@kvman/sdk';
import type { SessionDoc } from '../schemas/records.ts';
import type { TxRecords } from '../store/collections.ts';

// A chat's lead may answer a background result that needs nothing with an empty reply (plan 08 §8.2, ADR 0113, 1): it
// ends the turn quietly when nothing since the chat's last reply came from the person. A helper's empty reply is never
// quiet, since its last reply is its answer, and a turn the person spoke in keeps ADR 0054's hint.

const scanned = 1000;

/** Whether an empty reply in this turn ends it as done, with no hint. */
export function quietEnding(store: TxRecords, session: Stored<SessionDoc>, turnId: string): boolean {
  if (session.parentId !== null) return false;
  const replies = store.messages.find({ sessionId: session.id, kind: 'assistant' }, { limit: scanned, order: 'desc' });
  const before = replies.find((reply) => reply.turnId !== turnId)?.seq ?? -1;
  const received = store.messages.find({ sessionId: session.id, kind: 'user' }, { limit: scanned, order: 'desc' }).filter((message) => message.seq > before);
  return received.length > 0 && received.every((message) => message.source !== null && message.source.kind !== 'user');
}
