import type { Ctx, Json, Stored } from '@kvman/sdk';
import { callName, type JsonFields } from '../calls/call-name.ts';
import type { TurnDoc } from '../schemas/records.ts';
import { records } from '../store/collections.ts';

// How far a helper got, and what it waits on (plan 08 §8.5, ADR 0085, 2): its current or last turn's steps, the time of
// its newest message, its last five calls, oldest first, and the calls the person must decide, each named by `callName`
// (ADR 0089, 1).

export type HelperProgress = { steps: number; lastActivityAt: string; recentCalls: string[] };

const recentShown = 5;

const objectOf = (value: Json | undefined): JsonFields =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {};

const fieldOf = (value: Json | undefined, name: string): Json | undefined => objectOf(value)[name];

// A `run` call's connector command and payload, named; a call stored before `run` has none.
function named(call: Json | undefined): string[] {
  const { connector, command, payload } = objectOf(call);
  return typeof connector === 'string' && typeof command === 'string' ? [callName(connector, command, objectOf(payload))] : [];
}

function callNames(content: Json | undefined): string[] {
  if (!Array.isArray(content)) return [];
  return content.flatMap((block) => (fieldOf(block, 'type') === 'toolCall' ? named(fieldOf(block, 'arguments')) : []));
}

export async function helperProgress(ctx: Ctx, childId: string, turn: Stored<TurnDoc> | undefined): Promise<HelperProgress> {
  const store = records(ctx.store);
  const [[newest], replies] = await Promise.all([
    store.messages.find({ sessionId: childId }, { limit: 1, order: 'desc' }),
    store.messages.find({ sessionId: childId, kind: 'assistant' }, { limit: recentShown, order: 'desc' }),
  ]);
  const calls = replies.toReversed().flatMap((reply) => callNames(reply.content['content']));
  return { steps: turn?.steps ?? 0, lastActivityAt: newest?.createdAt ?? turn?.startedAt ?? '', recentCalls: calls.slice(-recentShown) };
}

/** The calls a helper's open turn waits on the person for: an approval's call named, and a question's prompt. */
export function waitingFor(turn: Stored<TurnDoc> | undefined): string[] {
  if (turn === undefined || turn.outcome !== null) return [];
  return turn.pending.flatMap((item) => {
    if (item.questionId === null || (item.kind !== 'approval' && item.kind !== 'question')) return [];
    if (item.kind === 'approval') return named(item.question ?? undefined);
    const prompt = fieldOf(item.question ?? undefined, 'prompt');
    return [typeof prompt === 'string' ? prompt : ''];
  });
}
