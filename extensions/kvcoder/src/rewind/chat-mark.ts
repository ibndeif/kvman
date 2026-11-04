import type { TxRecords } from '../store/collections.ts';
import { executionRootInTx } from '../sessions/execution-root.ts';

// What came after a message (ADR 0118, 4): a record keeps its chat's `nextSeq` from the transaction that made it, so one
// made after the message has `atSeq` above the message's `seq`, whatever the clocks say.

/** The `nextSeq` of the chat at the root of `sessionId`, or `null` when its chat is gone or being deleted. */
export function chatSeqInTx(store: TxRecords, sessionId: string): number | null {
  return executionRootInTx(store, sessionId)?.nextSeq ?? null;
}
