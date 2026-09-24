import type { Priority, ReplyPayload } from '@kvman/protocol';
import type { AdmittedMessage, InvocationOutcome, MessageState, StoredMessage } from './commit-unit.ts';
import type { Connection } from './driver.ts';

export const priorityCodes: Record<Priority, number> = { interactive: 0, normal: 1, background: 2 };

const insertSql = `INSERT INTO messages (id, kind, type, source, target, handler, workspace_id, lane, payload, context, state, priority,
  not_before, deadline_at, correlation_id, causation_id, on_reply, idempotency_source, idempotency_key, digest, result, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

function storedLane(admitted: AdmittedMessage): string | null {
  return admitted.message.lane === undefined ? null : `${admitted.handler}|${admitted.message.lane}`;
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

function stateOf(outcome: InvocationOutcome): { state: MessageState; result: ReplyPayload | undefined } {
  if ('deferred' in outcome) return { state: 'awaiting', result: undefined };
  return outcome.ok ? { state: 'done', result: outcome } : { state: 'failed', result: outcome };
}

export function markInvocation(connection: Connection, messageId: string, outcome: InvocationOutcome, now: number): void {
  const { state, result } = stateOf(outcome);
  connection
    .prepare('UPDATE messages SET state = ?, result = ?, updated_at = ? WHERE id = ?')
    .run(state, result === undefined ? null : JSON.stringify(result), now, messageId);
}
