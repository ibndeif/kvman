import type { Stored } from '@kvman/sdk';
import type { HeldResult, Outcome, SessionDoc, TurnDoc } from '../schemas/records.ts';
import type { TxRecords } from '../store/collections.ts';
import { appendResults } from './call-results.ts';
import { heldText } from './resolve.ts';

// The calls of a turn that ends (ADR 0087, 1): each call of its last reply that has no stored result gets one, so the
// model is never sent a call without its result. A held result stays as it was; a call that never started says so; a
// call that was running when the turn ended has effects nobody knows.

type Ended = Exclude<Outcome, 'done'>;

const why: Record<Ended, string> = {
  cancelled: 'the person stopped the turn',
  interrupted: 'kvman stopped',
  failed: 'the turn failed',
  maxSteps: 'the turn reached its step limit',
};

const notRun = (reason: string): string => `not run: ${reason}`;
const stopped = (reason: string): string => `stopped while it ran (${reason}): what it changed is unknown, so check before you run it again`;

type CallBlock = { type: string; id?: string; name?: string };

function replyCalls(content: unknown): TurnDoc['calls'] {
  if (!Array.isArray(content)) return [];
  return content.flatMap((block: CallBlock) => (block.type === 'toolCall' && block.id !== undefined && block.name !== undefined ? [{ toolCallId: block.id, toolName: block.name }] : []));
}

// What a call without a stored result returns, from what the turn still held for it.
function endedResult(turn: Stored<TurnDoc>, toolCallId: string, reason: string): HeldResult {
  const held = turn.results.find((result) => result.toolCallId === toolCallId);
  // A held result with a `run` is an approved call that the next step would have run.
  if (held !== undefined && held.run === null) return held;
  if (held !== undefined || turn.deferredCalls.some((deferred) => deferred.toolCallId === toolCallId)) return heldText(toolCallId, notRun(reason), true);
  const pending = turn.pending.find((item) => item.toolCallId === toolCallId);
  if (pending?.kind === 'question' || pending?.kind === 'approval') return heldText(toolCallId, notRun(reason), true);
  return heldText(toolCallId, stopped(reason), true);
}

/** Appends, in the ending transaction, a result for each call of the turn's last reply that has none. */
export function appendEndedCalls(store: TxRecords, session: Stored<SessionDoc>, turn: Stored<TurnDoc>, outcome: Outcome): void {
  // A turn ends `done` only on a reply with no calls.
  if (outcome === 'done') return;
  const [reply] = store.messages.find({ sessionId: session.id, turnId: turn.id, kind: 'assistant' }, { limit: 1, order: 'desc' });
  if (reply === undefined) return;
  const answered = new Set(store.messages.find({ sessionId: session.id, turnId: turn.id, kind: 'toolResult' }, { limit: 1000, order: 'desc' }).filter((message) => message.seq > reply.seq).map((message) => String(message.content['toolCallId'])));
  const calls = replyCalls(reply.content['content']).filter((call) => !answered.has(call.toolCallId));
  if (calls.length === 0) return;
  appendResults(store, session, turn.id, calls, calls.map((call) => endedResult(turn, call.toolCallId, why[outcome])));
}
