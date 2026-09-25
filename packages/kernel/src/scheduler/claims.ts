import type { Message } from '@kvman/protocol';
import { StorageFailure, type Connection } from '../storage/driver.ts';
import { messageOfRow } from '../storage/stored-message.ts';
import type { PendingEntry } from './run-queues.ts';

export type ClaimResult = { claimed: true; message: Message } | { claimed: false };

// A claim moves a pending row to running (02 §2.12). A row that is no longer pending (cancelled meanwhile) is not
// claimed.
export function claimMessage(connection: Connection, entry: PendingEntry, now: number): ClaimResult {
  const changed = connection.prepare("UPDATE messages SET state = 'running', updated_at = ? WHERE id = ? AND state = 'pending'").run(now, entry.id);
  if (changed.changes === 0) return { claimed: false };
  const row = connection.prepare('SELECT * FROM messages WHERE id = ?').get(entry.id);
  if (row === undefined) throw new StorageFailure('corrupt', `the claimed message ${entry.id} disappeared`);
  return { claimed: true, message: messageOfRow(row) };
}
