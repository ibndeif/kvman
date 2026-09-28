import type { Json } from '@kvman/protocol';
import { kernelProblem } from '../problems.ts';
import { UnitRejected, type UnitScope } from './unit-contents.ts';

export type RetryChange = { kind: 'message.retry'; messageId: string };

// kernel.message.retry (03 §3.8, ADR 0164): a dead message is pending again with attempts 0 and no stored reply; its
// onReply is cleared, since its sender already received MESSAGE_DEAD. A pending one runs without waiting out its backoff.
export function applyRetryChange(scope: UnitScope, change: RetryChange): Json {
  const row = scope.connection.prepare('SELECT state FROM messages WHERE id = ?').get(change.messageId);
  if (row === undefined) throw new UnitRejected(kernelProblem('NOT_FOUND', { correlationId: scope.correlationId, detail: `no message ${change.messageId} exists` }));
  const state = String(row['state']);
  if (state === 'dead') {
    scope.connection
      .prepare(`UPDATE messages SET state = 'pending', attempts = 0, not_before = NULL, result = NULL, result_ref = NULL, on_reply = NULL,
        retain_until = NULL, updated_at = ? WHERE id = ?`)
      .run(scope.now, change.messageId);
    return {};
  }
  if (state === 'pending') {
    scope.connection.prepare('UPDATE messages SET not_before = NULL, updated_at = ? WHERE id = ?').run(scope.now, change.messageId);
    return {};
  }
  throw new UnitRejected(kernelProblem('VALIDATION_FAILED', {
    correlationId: scope.correlationId, detail: `the message ${change.messageId} is ${state}; only a dead or pending message is retried`,
    issues: [{ path: 'messageId', message: `the message is ${state}` }],
  }));
}
