import { replyPayloadSchema, type MessageStatus } from '@kvman/protocol';
import { jsonOf } from '../store/json-order.ts';
import { storedState } from './message-rows.ts';
import { storedReplyText, type RowReader } from './stored-message.ts';

// GET /messages/:id (12 §12.2, ADR 0094): a stored message's state, with its reply's value or its problem.
export function readMessageStatus(rows: RowReader, id: string): MessageStatus | undefined {
  const row = rows.connection.prepare('SELECT id, type, state, result, result_ref FROM messages WHERE id = ?').get(id);
  if (row === undefined) return undefined;
  const status: MessageStatus = { id: String(row['id']), type: String(row['type']), state: storedState(row['state']) };
  const text = storedReplyText(rows.files, row);
  if (text === undefined) return status;
  const reply = replyPayloadSchema.parse(jsonOf(text));
  return reply.ok ? { ...status, reply: reply.value } : { ...status, problem: reply.problem };
}
