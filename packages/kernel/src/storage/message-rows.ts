import type { Message, Priority, ReplyPayload } from '@kvman/protocol';
import type { AdmittedMessage, InvocationOutcome, MessageState, RetryOutcome, StoredMessage } from './commit-unit.ts';
import { StorageFailure } from './driver.ts';
import { spillJson, spillRefs, type RowWriter } from './spill.ts';

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

const insertSql = `INSERT INTO messages (id, kind, type, source, target, handler, workspace_id, lane, payload, payload_ref, context, state,
  priority, not_before, deadline_at, correlation_id, causation_id, on_reply, idempotency_source, idempotency_key, digest, result, result_ref,
  created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

// A lane belongs to the handling extension (02 §2.6), also for an event delivery, whose handler is
// <extension>|subscription:<pattern> (ADR 0053).
export function laneKeyOf(handler: string, lane: string): string {
  return `${handler.split('|')[0] ?? handler}|${lane}`;
}

function storedLane(admitted: AdmittedMessage): string | null {
  return admitted.message.lane === undefined ? null : laneKeyOf(admitted.handler, admitted.message.lane);
}

export function insertMessage(rows: RowWriter, admitted: AdmittedMessage, state: MessageState, result: ReplyPayload | undefined): StoredMessage {
  const { message } = admitted;
  const payload = spillJson(rows, message.payload, { ws: message.workspaceId, ref: spillRefs.payload(message.id) });
  const stored = result === undefined ? { inline: null, ref: null } : spillJson(rows, result, { ws: message.workspaceId, ref: spillRefs.result(message.id) });
  const inserted = rows.connection.prepare(insertSql).run(
    message.id, message.kind, message.type, message.source, message.target ?? null, admitted.handler, message.workspaceId ?? null,
    storedLane(admitted), payload.inline, payload.ref, JSON.stringify(message.context), state, priorityCodes[message.priority],
    message.notBefore ?? null, message.deadlineAt ?? null, message.correlationId, message.causationId ?? null,
    message.onReply === undefined ? null : JSON.stringify(message.onReply), message.idempotencyKey === undefined ? null : message.source,
    message.idempotencyKey ?? null, admitted.digest ?? null, stored.inline, stored.ref, rows.now, rows.now,
  );
  return { ...admitted, seq: inserted.lastInsertRowid, state };
}

export type FinalOutcome = Exclude<InvocationOutcome, { deferred: true }>;

export function replyOf(outcome: FinalOutcome): ReplyPayload {
  return outcome.ok ? { ok: true, value: outcome.value } : { ok: false, problem: outcome.problem };
}

// A deferred command waits in `awaiting` with its onAbort (02 §2.8); any other outcome is its reply.
export function markInvocation(rows: RowWriter, message: Message, outcome: InvocationOutcome): void {
  if ('deferred' in outcome) {
    rows.connection
      .prepare("UPDATE messages SET state = 'awaiting', on_abort = ?, updated_at = ? WHERE id = ?")
      .run(outcome.onAbort ?? null, rows.now, message.id);
    return;
  }
  markReplied(rows, message, replyOf(outcome));
}

export function markReplied(rows: RowWriter, message: Message, reply: ReplyPayload, state: MessageState = reply.ok ? 'done' : 'failed'): void {
  const stored = spillJson(rows, reply, { ws: message.workspaceId, ref: spillRefs.result(message.id) });
  rows.connection
    .prepare('UPDATE messages SET state = ?, result = ?, result_ref = ?, updated_at = ? WHERE id = ?')
    .run(state, stored.inline, stored.ref, rows.now, message.id);
}

export function markRetry(rows: RowWriter, message: Message, attempts: number, outcome: RetryOutcome): void {
  if (outcome.state === 'pending') {
    rows.connection
      .prepare("UPDATE messages SET state = 'pending', attempts = ?, not_before = ?, updated_at = ? WHERE id = ?")
      .run(attempts, outcome.notBefore, rows.now, message.id);
    return;
  }
  rows.connection.prepare('UPDATE messages SET attempts = ? WHERE id = ?').run(attempts, message.id);
  markReplied(rows, message, outcome.reply, 'dead');
}

// The row keeps the event's own createdAt, so a replay on the event stream equals the live push (ADR 0027).
export function insertEvent(rows: RowWriter, event: Message): number {
  const payload = spillJson(rows, event.payload, { ws: event.workspaceId, ref: spillRefs.event(event.id) });
  return rows.connection
    .prepare(`INSERT INTO events (id, type, source, workspace_id, payload, payload_ref, correlation_id, causation_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(event.id, event.type, event.source, event.workspaceId ?? null, payload.inline, payload.ref, event.correlationId, event.causationId ?? null, event.createdAt)
    .lastInsertRowid;
}
