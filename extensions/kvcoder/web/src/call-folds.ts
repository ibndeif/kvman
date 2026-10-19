import type { Message } from '../../src/index.ts';
import { callFailure } from './call-failure.ts';
import type { CallView } from './call-view.ts';
import type { Translate } from './kvman.ts';
import { answeredQuestion, artifactOf, extensionCardOf, resultCard, textOf, thinkingOf } from './message-parts.ts';

// A turn as a story (plan 08 §8.7, ADR 0093, 1): two or more call cards in a row, with nothing the person reads between
// them, fold into one row that says what they did; the agent's text, notices, questions, and artifacts stay as they are.

export type Row = { kind: 'message'; message: Message } | { kind: 'fold'; messages: Message[] };

/** A result the conversation shows as a call card. */
export function isCallCard(message: Message, calls: ReadonlyMap<string, CallView>): boolean {
  return message.kind === 'toolResult' && artifactOf(message) === undefined && answeredQuestion(message, calls) === undefined && extensionCardOf(message) === undefined;
}

// A reply that held only calls shows nothing, so it doesn't break a run of cards.
const showsNothing = (message: Message): boolean => message.kind === 'assistant' && thinkingOf(message) === '' && textOf(message.content['content']) === '';

/** The conversation's rows: each message, or a fold of the call cards that come one after another. */
export function foldedRows(messages: readonly Message[], calls: ReadonlyMap<string, CallView>): Row[] {
  const rows: Row[] = [];
  let run: Message[] = [];
  const flush = (): void => {
    if (run.filter((message) => isCallCard(message, calls)).length >= 2) rows.push({ kind: 'fold', messages: run });
    else for (const message of run) rows.push({ kind: 'message', message });
    run = [];
  };
  for (const message of messages) {
    if (isCallCard(message, calls) || (run.length > 0 && showsNothing(message))) run.push(message);
    else {
      flush();
      rows.push({ kind: 'message', message });
    }
  }
  flush();
  return rows;
}

type Tally = { read: number; searched: number; changed: number; ran: number; other: number; failed: number };
const searches = new Set(['search', 'find', 'list']);
const changes = new Set(['write', 'edit', 'undo', 'assemble', 'part']);

function kindOf(card: CallView): Exclude<keyof Tally, 'failed'> {
  if (card.connector === 'fs' && card.command === 'read') return 'read';
  if (card.connector === 'fs' && card.command !== undefined && searches.has(card.command)) return 'searched';
  if (card.connector === 'fs' && card.command !== undefined && changes.has(card.command)) return 'changed';
  return card.line !== undefined ? 'ran' : 'other';
}

/** What a fold's calls did, and how long they took. */
export function foldTally(messages: readonly Message[], calls: ReadonlyMap<string, CallView>): { tally: Tally; ms: number; failed: boolean } {
  const tally: Tally = { read: 0, searched: 0, changed: 0, ran: 0, other: 0, failed: 0 };
  let ms = 0;
  for (const message of messages) {
    if (!isCallCard(message, calls)) continue;
    const card = resultCard(message, calls);
    tally[kindOf(card)] += 1;
    // The agent's own invalid request is quiet, so it isn't a failure here either (ADR 0079, 2).
    if (card.failed && callFailure(card.output).kind !== 'invalid') tally.failed += 1;
    ms += (card.writtenMs ?? 0) + (card.durationMs ?? 0);
  }
  return { tally, ms, failed: tally.failed > 0 };
}

/** A fold's words, as `Read 2 · Searched 1 · Ran 1`. */
export function tallyText(t: Translate, tally: Tally): string {
  const order = ['read', 'searched', 'changed', 'ran', 'other', 'failed'] as const;
  return order.filter((kind) => tally[kind] > 0).map((kind) => t(`kvcoder.ui.fold.${kind}`, { count: tally[kind] })).join(' · ');
}
