import type { Problem, ReplyPayload } from '@kvman/protocol';
import { kernelProblem } from '../problems.ts';
import type { Sender } from './commit-unit.ts';
import { readMessage, type MessageRecord } from './stored-message.ts';
import { finalReply, recordSend, type UnitScope } from './unit-contents.ts';

const kernelSender: Sender = { address: 'kernel' };

export type EndReason = 'cancelled' | 'deadline';

const unfinished = new Set(['pending', 'running', 'awaiting']);

// 02 §2.9, ADRs 0083 and 0084: an unfinished message ends with its reply for waiters and its continuation; a
// deferred command also sends its onAbort to its owner.
function endMessage(scope: UnitScope, record: MessageRecord, problem: Problem, reason: EndReason, sendAbort = true): void {
  const { message } = record;
  const reply: ReplyPayload = { ok: false, problem };
  const state = reason === 'cancelled' ? 'cancelled' : 'failed';
  scope.connection.prepare('UPDATE messages SET state = ?, result = ?, updated_at = ? WHERE id = ?').run(state, JSON.stringify(reply), scope.now, message.id);
  scope.applied.ended.push({ messageId: message.id, previous: record.state, handler: record.handler });
  finalReply(scope, message, reply);
  if (!sendAbort || record.state !== 'awaiting' || record.onAbort === undefined) return;
  const send = { type: record.onAbort, payload: { commandId: message.id, reason }, idempotencyKey: `${message.id}:abort` };
  recordSend(scope, scope.admission.admitSend(scope.connection, { send, sender: kernelSender, cause: message, workspaceId: message.workspaceId, index: 0 }));
}

// Cancels every message of `messageIds` that is still unfinished; returns how many. An uninstall sends no onAbort,
// because the owner is gone (06 §6.8).
export function cancelMessages(scope: UnitScope, messageIds: readonly string[], options: { sendAbort: boolean } = { sendAbort: true }): number {
  let cancelled = 0;
  for (const id of messageIds) {
    const record = readMessage(scope.connection, id);
    if (record === undefined || !unfinished.has(record.state)) continue;
    const { message } = record;
    endMessage(scope, record, kernelProblem('CANCELLED', { correlationId: message.correlationId, messageId: message.id }), 'cancelled', options.sendAbort);
    cancelled += 1;
  }
  return cancelled;
}

// A pending or awaiting message whose deadline passed; a running one is ended by its invocation deadline.
export function expireMessages(scope: UnitScope, messageIds: readonly string[]): void {
  for (const id of messageIds) {
    const record = readMessage(scope.connection, id);
    const deadlineAt = record?.message.deadlineAt;
    if (record === undefined || (record.state !== 'pending' && record.state !== 'awaiting') || deadlineAt === undefined || deadlineAt > scope.now) continue;
    const { message } = record;
    endMessage(scope, record, kernelProblem('DEADLINE_EXCEEDED', { correlationId: message.correlationId, messageId: message.id }), 'deadline');
  }
}
