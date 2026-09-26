import { messageSchema, type Message } from '@kvman/protocol';
import { StorageFailure, type Connection, type SqlRow, type SqlValue } from './driver.ts';
import { priorityOfCode, storedState } from './message-rows.ts';
import type { MessageState } from './commit-unit.ts';
import { storedJsonText, type SpillFiles } from './spill.ts';

// What reads stored rows: the connection, and the files spilled JSON lives in (ADR 0135).
export type RowReader = { connection: Connection; files: SpillFiles };

function text(value: SqlValue | undefined): string | undefined {
  return value === null || value === undefined ? undefined : String(value);
}

function stored(value: string | undefined, name: string, id: string): unknown {
  if (value === undefined) throw new StorageFailure('corrupt', `the stored message ${id} has no ${name}`);
  return JSON.parse(value);
}

// The stored lane is <extension>|<lane> (ADR 0053); the message carries the rendered lane only.
export function laneOfKey(laneKey: string | undefined): string | undefined {
  return laneKey === undefined ? undefined : laneKey.slice(laneKey.indexOf('|') + 1);
}

function numberOrUndefined(value: SqlValue | undefined): number | undefined {
  return value === null || value === undefined ? undefined : Number(value);
}

// The row is checked against the message schema like any persisted JSON; absent columns leave the field out.
export function messageOfRow(files: SpillFiles, row: SqlRow): Message {
  const id = String(row['id']);
  const onReply = text(row['on_reply']);
  const payload = storedJsonText(files, row['payload'], row['payload_ref']);
  const candidate: Record<string, unknown> = {
    v: 1, id, kind: row['kind'], type: row['type'], source: row['source'], payload: stored(payload, 'payload', id),
    correlationId: row['correlation_id'], context: stored(text(row['context']), 'context', id), priority: priorityOfCode(row['priority']),
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

export function readMessage(rows: RowReader, id: string): MessageRecord | undefined {
  const row = rows.connection.prepare('SELECT * FROM messages WHERE id = ?').get(id);
  if (row === undefined) return undefined;
  return { message: messageOfRow(rows.files, row), state: storedState(row['state']), handler: String(row['handler']), onAbort: text(row['on_abort']) };
}

export function readMessageState(connection: Connection, id: string): MessageState | undefined {
  const row = connection.prepare('SELECT state FROM messages WHERE id = ?').get(id);
  return row === undefined ? undefined : storedState(row['state']);
}

// A stored reply, read back from its blob when it spilled.
export function storedReplyText(files: SpillFiles, row: SqlRow): string | undefined {
  return storedJsonText(files, row['result'], row['result_ref']);
}
