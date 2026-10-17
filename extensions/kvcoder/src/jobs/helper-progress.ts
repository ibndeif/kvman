import type { Ctx, Json, Stored } from '@kvman/sdk';
import type { TurnDoc } from '../schemas/records.ts';
import { records } from '../store/collections.ts';

// How far a helper got, and what it waits on (plan 08 §8.5, ADR 0085, 2): its current or last turn's steps, the time of
// its newest message, the descriptions of its last five calls, oldest first, and the calls the person must decide.

export type HelperProgress = { steps: number; lastActivityAt: string; recentCalls: string[] };

const recentShown = 5;

const fieldOf = (value: Json | undefined, name: string): Json | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? value[name] : undefined;

function callDescriptions(content: Json | undefined): string[] {
  if (!Array.isArray(content)) return [];
  return content.flatMap((block) => {
    const description = fieldOf(fieldOf(block, 'arguments'), 'description');
    return fieldOf(block, 'type') === 'toolCall' && typeof description === 'string' ? [description] : [];
  });
}

export async function helperProgress(ctx: Ctx, childId: string, turn: Stored<TurnDoc> | undefined): Promise<HelperProgress> {
  const store = records(ctx.store);
  const [[newest], replies] = await Promise.all([
    store.messages.find({ sessionId: childId }, { limit: 1, order: 'desc' }),
    store.messages.find({ sessionId: childId, kind: 'assistant' }, { limit: recentShown, order: 'desc' }),
  ]);
  const calls = replies.toReversed().flatMap((reply) => callDescriptions(reply.content['content']));
  return { steps: turn?.steps ?? 0, lastActivityAt: newest?.createdAt ?? turn?.startedAt ?? '', recentCalls: calls.slice(-recentShown) };
}

/** The descriptions of the calls a helper's open turn waits on the person for. */
export function waitingFor(turn: Stored<TurnDoc> | undefined): string[] {
  if (turn === undefined || turn.outcome !== null) return [];
  return turn.pending.flatMap((item) => {
    if (item.questionId === null || (item.kind !== 'approval' && item.kind !== 'question')) return [];
    const said = fieldOf(item.question ?? undefined, item.kind === 'approval' ? 'description' : 'prompt');
    return [typeof said === 'string' ? said : ''];
  });
}
