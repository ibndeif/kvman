import { replyPayloadSchema, type MessageStatus } from '@kvman/protocol';
import { jsonOf } from '../store/json-order.ts';
import type { Connection } from './driver.ts';
import { storedState } from './message-rows.ts';

// GET /messages/:id (12 §12.2, ADR 0094): a stored message's state, with its reply's value or its problem.
export function readMessageStatus(connection: Connection, id: string): MessageStatus | undefined {
  const row = connection.prepare('SELECT id, type, state, result FROM messages WHERE id = ?').get(id);
  if (row === undefined) return undefined;
  const status: MessageStatus = { id: String(row['id']), type: String(row['type']), state: storedState(row['state']) };
  if (row['result'] === null) return status;
  const reply = replyPayloadSchema.parse(jsonOf(row['result']));
  return reply.ok ? { ...status, reply: reply.value } : { ...status, problem: reply.problem };
}
