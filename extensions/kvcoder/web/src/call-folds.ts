import type { Message } from '../../src/index.ts';
import { callFailure } from './call-failure.ts';
import type { CallView } from './call-view.ts';
import { fields, pageLanguage, type Translate } from './kvman.ts';
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
type Kind = Exclude<keyof Tally, 'failed'>;
const reads = new Set(['read', 'read-files']);
const searches = new Set(['search', 'find', 'list']);
const changes = new Set(['write', 'edit', 'undo', 'assemble', 'part']);

function kindOf(card: CallView): Kind {
  if (card.connector === 'fs' && card.command !== undefined && reads.has(card.command)) return 'read';
  if (card.connector === 'fs' && card.command !== undefined && searches.has(card.command)) return 'searched';
  if (card.connector === 'fs' && card.command !== undefined && changes.has(card.command)) return 'changed';
  return card.line !== undefined ? 'ran' : 'other';
}

// The files a read or a change touched; a call whose payload names none counts as one file of its own.
function filesOf(card: CallView, messageId: string): string[] {
  const listed: unknown = card.fields?.['files'];
  const paths = Array.isArray(listed) ? listed.map((file: unknown) => fields(file)['path']) : [card.fields?.['path']];
  const named = paths.filter((path): path is string => typeof path === 'string' && path !== '');
  return named.length === 0 ? [messageId] : named;
}

/** What a fold's calls did, with files counted once each, and how long they took. */
export function foldTally(messages: readonly Message[], calls: ReadonlyMap<string, CallView>): { tally: Tally; ms: number; failed: boolean } {
  const tally: Tally = { read: 0, searched: 0, changed: 0, ran: 0, other: 0, failed: 0 };
  const files = { read: new Set<string>(), changed: new Set<string>() };
  let ms = 0;
  for (const message of messages) {
    if (!isCallCard(message, calls)) continue;
    const card = resultCard(message, calls);
    const kind = kindOf(card);
    if (kind === 'read' || kind === 'changed') for (const path of filesOf(card, message.id)) files[kind].add(path);
    else tally[kind] += 1;
    // The agent's own invalid request is quiet, so it isn't a failure here either (ADR 0079, 2).
    if (card.failed && callFailure(card.output).kind !== 'invalid') tally.failed += 1;
    ms += (card.writtenMs ?? 0) + (card.durationMs ?? 0);
  }
  return { tally: { ...tally, read: files.read.size, changed: files.changed.size }, ms, failed: tally.failed > 0 };
}

const kinds: readonly Kind[] = ['read', 'searched', 'changed', 'ran', 'other'];

/** A fold's words as a sentence, `Read 3 files, changed 1 file, ran 1 command`, and its failures, `1 failed` (ADR 0098, 2). */
export function foldWords(t: Translate, tally: Tally, language = pageLanguage()): { words: string; failed?: string } {
  const parts = kinds.filter((kind) => tally[kind] > 0).map((kind) => t(`kvcoder.ui.fold.${kind}`, { count: tally[kind] }));
  const sentence = parts.length === 0 ? '' : parts.reduce((first, next) => t('kvcoder.ui.fold.list', { first, next }));
  const words = sentence.charAt(0).toLocaleUpperCase(language) + sentence.slice(1);
  return tally.failed > 0 ? { words, failed: t('kvcoder.ui.fold.failed', { count: tally.failed }) } : { words };
}
