import { messageSchema, type Message } from '@kvman/protocol';
import { StorageFailure, type Connection, type SqlRow, type SqlValue } from './driver.ts';
import { priorityOfCode, storedState } from './message-rows.ts';
import type { MessageState } from './commit-unit.ts';

function text(value: SqlValue | undefined): string | undefined {
  return value === null || value === undefined ? undefined : String(value);
}

function stored(value: SqlValue | undefined, name: string, id: string): unknown {
  const json = text(value);
  if (json === undefined) throw new StorageFailure('corrupt', `the stored message ${id} has no ${name}`);
  return JSON.parse(json);
}

// The stored lane is <extension>|<lane> (ADR 0053); the message carries the rendered lane only.
export function laneOfKey(laneKey: string | undefined): string | undefined {
  return laneKey === undefined ? undefined : laneKey.slice(laneKey.indexOf('|') + 1);
}

function numberOrUndefined(value: SqlValue | undefined): number | undefined {
  return value === null || value === undefined ? undefined : Number(value);
}

// The row is checked against the message schema like any persisted JSON; absent columns leave the field out.
export function messageOfRow(row: SqlRow): Message {
  const id = String(row['id']);
  const onReply = text(row['on_reply']);
  const candidate: Record<string, unknown> = {
    v: 1, id, kind: row['kind'], type: row['type'], source: row['source'], payload: stored(row['payload'], 'payload', id),
    correlationId: row['correlation_id'], context: stored(row['context'], 'context', id), priority: priorityOfCode(row['priority']),
    createdAt: numberOrUndefined(row['created_at']),
  };
  const optionalFields: Record<string, unknown> = {
    target: text(row['target']), workspaceId: text(row['workspace_id']), lane: laneOfKey(text(row['lane'])),
    causationId: text(row['causation_id']), onReply: onReply === undefined ? undefined : JSON.parse(onReply),
    idempotencyKey: text(row['idempotency_key']), delivery: row['kind'] === 'event' ? 'durable' : undefined,
    deadlineAt: numberOrUndefined(row['deadline_at']), notBefore: numberOrUndefined(row['not_before']),
  };
  for (const [field, value] of Object.entries(optionalFields)) if (value !== undefined) candidate[field] = value;
  const parsed = messageSchema.safeParse(candidate);
  if (!parsed.success) throw new StorageFailure('corrupt', `the stored message ${id} does not match the message schema`);
  return parsed.data;
}

// A stored message with the columns only the kernel reads: its state, its handler, and its onAbort (ADR 0070).
export type MessageRecord = { message: Message; state: MessageState; handler: string; onAbort: string | undefined };

export function readMessage(connection: Connection, id: string): MessageRecord | undefined {
  const row = connection.prepare('SELECT * FROM messages WHERE id = ?').get(id);
  if (row === undefined) return undefined;
  return { message: messageOfRow(row), state: storedState(row['state']), handler: String(row['handler']), onAbort: text(row['on_abort']) };
}
