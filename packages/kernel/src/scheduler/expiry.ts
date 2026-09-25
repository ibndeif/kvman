import type { CommitUnit } from '../storage/commit-unit.ts';
import type { RetryOutcome } from '../storage/commit-unit.ts';
import type { Message } from '@kvman/protocol';

// ADR 0084: pending and awaiting messages whose deadline passed end in one kernel unit.
export function expiryUnit(messageIds: readonly string[]): CommitUnit {
  return { origin: { kind: 'expire', messageIds, correlationId: messageIds[0] ?? '' }, writes: [], sends: [], publishes: [], replies: [] };
}

// 03 §3.6: an invocation caught on a stopped host through no fault of its own returns to pending, attempts unchanged.
export function redeliveryUnit(message: Message, attempts: number, now: number): CommitUnit {
  const outcome: RetryOutcome = { state: 'pending', notBefore: now };
  return { origin: { kind: 'retry', message, attempts, outcome }, writes: [], sends: [], publishes: [], replies: [] };
}
