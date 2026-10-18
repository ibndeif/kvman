import type { Stored } from '@kvman/sdk';
import type { HeldResult, JsonValue, SessionDoc, TurnDoc } from '../schemas/records.ts';
import type { TxRecords } from '../store/collections.ts';
import { appendMessage } from './history.ts';

// A reply's results as stored messages (plan 08 §8.2): one toolResult message per call, in the model's call order.

// A result's details without a second copy of its output (ADR 0034, 7): the output stays only where it differs from the
// text the model gets, which is a shell line's and a binary's.
function storedDetails(held: HeldResult): JsonValue {
  const details = held.details;
  if (typeof details !== 'object' || details === null || Array.isArray(details) || details['output'] !== held.text) return details;
  return Object.fromEntries(Object.entries(details).filter(([name]) => name !== 'output'));
}

/** Appends a step's results as toolResult messages, in the model's call order. */
export function appendResults(store: TxRecords, session: Stored<SessionDoc>, turnId: string, calls: TurnDoc['calls'], results: readonly HeldResult[]): void {
  for (const call of calls) {
    const held = results.find((candidate) => candidate.toolCallId === call.toolCallId);
    if (held === undefined) continue;
    const content: Record<string, JsonValue> = { role: 'toolResult', toolCallId: call.toolCallId, toolName: call.toolName, content: [{ type: 'text', text: held.text }], isError: held.isError, timestamp: Date.now() };
    appendMessage(store, session, { kind: 'toolResult', content: held.details === null ? content : { ...content, details: storedDetails(held) }, turnId });
  }
}
