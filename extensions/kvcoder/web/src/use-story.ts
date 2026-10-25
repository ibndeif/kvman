import { computed, type Ref } from 'vue';
import type { Message, Session, Turn } from '../../src/index.ts';
import { foldedRows, type Row } from './call-folds.ts';
import type { CallView } from './call-view.ts';
import { tokensUsed, totals, type Translate } from './kvman.ts';
import { textOf } from './message-parts.ts';

// The conversation as a story (plan 08 §8.7, ADR 0093, 1): its rows, with calls in a row folded; each ended turn's line
// under the row that holds its last message (ADR 0035, 1); the turn that runs; and the final answers to mark.

export function useStory(t: Translate, messages: Ref<Message[]>, calls: Ref<ReadonlyMap<string, CallView>>, turns: Ref<Turn[]>, session: Ref<Session | null | undefined>) {
  const rows = computed(() => foldedRows(messages.value, calls.value));

  // Each ended turn's totals go under its last message: its last answer, or the cards of its last calls.
  const turnTotals = computed(() => {
    const last = new Map<string, string>();
    for (const message of messages.value) if ((message.kind === 'assistant' || message.kind === 'toolResult') && message.turnId !== undefined) last.set(message.turnId, message.id);
    const shown = new Map<string, { text: string; tokens: string }>();
    for (const turn of turns.value) {
      const messageId = last.get(turn.id);
      if (messageId !== undefined && turn.outcome !== undefined) shown.set(messageId, { text: totals(t, turn.usage, turn.durationMs), tokens: tokensUsed(t, turn.usage) });
    }
    return shown;
  });

  const idsOf = (row: Row): string[] => (row.kind === 'fold' ? row.messages.map((message) => message.id) : row.kind === 'headline' ? row.ids : [row.message.id]);
  const rowKey = (row: Row): string => `${row.kind}:${idsOf(row)[0] ?? ''}`;
  const rowTotals = (row: Row) => idsOf(row).map((id) => turnTotals.value.get(id)).findLast((found) => found !== undefined);
  const runningTurnId = computed(() => (session.value?.status === 'idle' ? undefined : turns.value[0]?.outcome === undefined ? turns.value[0]?.id : undefined));
  // An ended turn's last text is its final answer.
  const finalAnswers = computed(() => {
    const ended = new Set(turns.value.filter((turn) => turn.outcome !== undefined).map((turn) => turn.id));
    const last = new Map<string, string>();
    for (const message of messages.value) if (message.kind === 'assistant' && message.turnId !== undefined && ended.has(message.turnId) && textOf(message.content['content']).trim() !== '') last.set(message.turnId, message.id);
    return new Set(last.values());
  });

  return { rows, rowKey, rowTotals, runningTurnId, finalAnswers };
}
