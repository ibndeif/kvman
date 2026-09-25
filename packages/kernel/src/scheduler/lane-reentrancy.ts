import type { Message, Problem } from '@kvman/protocol';
import { kernelProblem } from '../problems.ts';
import type { Connection } from '../storage/driver.ts';
import type { InFlight } from './in-flight.ts';

function causeOf(connection: Connection, id: string): string | undefined {
  const row = connection.prepare('SELECT causation_id FROM messages WHERE id = ?').get(id)
    ?? connection.prepare('SELECT causation_id FROM events WHERE id = ?').get(id);
  const cause = row?.['causation_id'];
  return cause === null || cause === undefined ? undefined : String(cause);
}

// Whether `ancestorId` is in the message's causation chain, through the messages and events that caused it.
export function causedBy(connection: Connection, message: Message, ancestorId: string): boolean {
  const seen = new Set<string>();
  for (let current = message.causationId; current !== undefined && !seen.has(current); current = causeOf(connection, current)) {
    if (current === ancestorId) return true;
    seen.add(current);
  }
  return false;
}

// 02 §2.6: waiting on a lane held by the caller or by a running ancestor would never end (ADR 0063).
export function laneReentrancyProblem(connection: Connection, inFlight: InFlight, caller: Message, laneKey: string): Problem | undefined {
  const holder = inFlight.runningHolder(laneKey);
  if (holder === undefined) return undefined;
  const heldByChain = holder.entry.id === caller.id || causedBy(connection, caller, holder.entry.id);
  if (!heldByChain) return undefined;
  return kernelProblem('LANE_REENTRANT', {
    correlationId: caller.correlationId, messageId: caller.id,
    detail: `the target lane is held by ${holder.entry.id}, which is in this message's causation chain`,
    hint: 'send the command with onReply (a continuation) instead of waiting for it',
  });
}
