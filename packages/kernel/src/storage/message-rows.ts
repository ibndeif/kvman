import type { Message, Priority, ReplyPayload } from '@kvman/protocol';
import type { AdmittedMessage, InvocationOutcome, MessageState, RetryOutcome, StoredMessage } from './commit-unit.ts';
import { StorageFailure, type Connection } from './driver.ts';

const messageStates: readonly MessageState[] = ['pending', 'running', 'awaiting', 'done', 'failed', 'dead', 'cancelled'];

export function storedState(value: unknown): MessageState {
  const state = messageStates.find((candidate) => candidate === value);
  if (state === undefined) throw new StorageFailure('corrupt', `a stored message has the unknown state ${String(value)}`);
  return state;
}

export const priorityCodes: Record<Priority, number> = { interactive: 0, normal: 1, background: 2 };

const priorityOrder: readonly Priority[] = ['interactive', 'normal', 'background'];

export function priorityOfCode(code: unknown): Priority {
  const priority = priorityOrder.find((candidate) => priorityCodes[candidate] === code);
  if (priority === undefined) throw new StorageFailure('corrupt', `a stored message has the unknown priority code ${String(code)}`);
  return priority;
}

const insertSql = `INSERT INTO messages (id, kind, type, source, target, handler, workspace_id, lane, payload, context, state, priority,
  not_before, deadline_at, correlation_id, causation_id, on_reply, idempotency_source, idempotency_key, digest, result, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

// A lane belongs to the handling extension (02 §2.6), also for an event delivery, whose handler is
// <extension>|subscription:<pattern> (ADR 0053).
export function laneKeyOf(handler: string, lane: string): string {
  return `${handler.split('|')[0] ?? handler}|${lane}`;
}

function storedLane(admitted: AdmittedMessage): string | null {
  return admitted.message.lane === undefined ? null : laneKeyOf(admitted.handler, admitted.message.lane);
}

export function insertMessage(connection: Connection, admitted: AdmittedMessage, state: MessageState, result: ReplyPayload | undefined, now: number): StoredMessage {
  const { message } = admitted;
  const inserted = connection.prepare(insertSql).run(
    message.id, message.kind, message.type, message.source, message.target ?? null, admitted.handler, message.workspaceId ?? null,
    storedLane(admitted), JSON.stringify(message.payload), JSON.stringify(message.context), state, priorityCodes[message.priority],
    message.notBefore ?? null, message.deadlineAt ?? null, message.correlationId, message.causationId ?? null,
    message.onReply === undefined ? null : JSON.stringify(message.onReply), message.idempotencyKey === undefined ? null : message.source,
    message.idempotencyKey ?? null, admitted.digest ?? null, result === undefined ? null : JSON.stringify(result), now, now,
  );
  return { ...admitted, seq: inserted.lastInsertRowid, state };
}

export type FinalOutcome = Exclude<InvocationOutcome, { deferred: true }>;

export function replyOf(outcome: FinalOutcome): ReplyPayload {
  return outcome.ok ? { ok: true, value: outcome.value } : { ok: false, problem: outcome.problem };
}

// A deferred command waits in `awaiting` with its onAbort (02 §2.8); any other outcome is its reply.
export function markInvocation(connection: Connection, messageId: string, outcome: InvocationOutcome, now: number): void {
  if ('deferred' in outcome) {
    connection
      .prepare("UPDATE messages SET state = 'awaiting', on_abort = ?, updated_at = ? WHERE id = ?")
      .run(outcome.onAbort ?? null, now, messageId);
    return;
  }
  markReplied(connection, messageId, replyOf(outcome), now);
}

export function markReplied(connection: Connection, messageId: string, reply: ReplyPayload, now: number): void {
  const state: MessageState = reply.ok ? 'done' : 'failed';
  connection.prepare('UPDATE messages SET state = ?, result = ?, updated_at = ? WHERE id = ?').run(state, JSON.stringify(reply), now, messageId);
}

export function markRetry(connection: Connection, messageId: string, attempts: number, outcome: RetryOutcome, now: number): void {
  if (outcome.state === 'pending') {
    connection
      .prepare("UPDATE messages SET state = 'pending', attempts = ?, not_before = ?, updated_at = ? WHERE id = ?")
      .run(attempts, outcome.notBefore, now, messageId);
    return;
  }
  connection
    .prepare("UPDATE messages SET state = 'dead', attempts = ?, result = ?, updated_at = ? WHERE id = ?")
    .run(attempts, JSON.stringify(outcome.reply), now, messageId);
}

// The row keeps the event's own createdAt, so a replay on the event stream equals the live push (ADR 0027).
export function insertEvent(connection: Connection, event: Message): number {
  return connection
    .prepare('INSERT INTO events (id, type, source, workspace_id, payload, correlation_id, causation_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(event.id, event.type, event.source, event.workspaceId ?? null, JSON.stringify(event.payload), event.correlationId, event.causationId ?? null, event.createdAt)
    .lastInsertRowid;
}
