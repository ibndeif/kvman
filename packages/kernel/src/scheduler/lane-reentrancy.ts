import type { Message } from '@kvman/protocol';
import type { Connection } from '../storage/driver.ts';

function causeOf(connection: Connection, id: string): string | undefined {
  const row = connection.prepare('SELECT causation_id FROM messages WHERE id = ?').get(id)
    ?? connection.prepare('SELECT causation_id FROM events WHERE id = ?').get(id);
  const cause = row?.['causation_id'];
  return cause === null || cause === undefined ? undefined : String(cause);
}

// Whether `ancestorId` is in the message's causation chain, through the messages and events that caused it.
export function causedBy(connection: Connection, message: Message, ancestorId: string): boolean {
  const seen = new Set<string>();
  for (let current = message.causationId; current !== undefined && !seen.has(current); current = causeOf(connection, current)) {
    if (current === ancestorId) return true;
    seen.add(current);
  }
  return false;
}
