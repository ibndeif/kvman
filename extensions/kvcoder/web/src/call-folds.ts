import type { Message } from '../../src/index.ts';
import { callFailure } from './call-failure.ts';
import type { CallView } from './call-view.ts';
import { fields, pageLanguage, type Translate } from './kvman.ts';
import { answeredQuestion, artifactOf, exitedOnly, extensionCardOf, headlinesOf, resultCard, textOf, thinkingOf } from './message-parts.ts';

// A turn as a story (plan 08 §8.7, ADR 0093, 1; ADR 0102, 1): call cards in a row, with nothing the person reads between
// them, fold into one row that says what they did. A reply with no text doesn't break that row; a reply whose thinking
// starts a new headline starts a new group under that headline, which opens to show the thinking behind it. The
// agent's text, notices, questions, and artifacts stay as they are.

export type Row =
  | { kind: 'message'; message: Message }
  | { kind: 'fold'; messages: Message[] }
  /** A step's headline; `ids` are the replies that share it, and `thinking` theirs. */
  | { kind: 'headline'; ids: string[]; headline: string; thinking: string[] };

// The agent's own housekeeping, which the conversation doesn't show (ADR 0108, 13): any `help`, and these commands.
const housekeeping: Readonly<Record<string, ReadonlySet<string>>> = {
  mcp: new Set(['tools']),
  background: new Set(['list', 'output', 'wait']),
  'execution-map': new Set(['get', 'update']),
};

/** A result of the agent's housekeeping: no card, and nothing a fold counts. */
export function isHousekeeping(message: Message, calls: ReadonlyMap<string, CallView>): boolean {
  if (message.kind !== 'toolResult') return false;
  const call = calls.get(String(message.content['toolCallId']));
  if (call?.connector === undefined || call.command === undefined) return false;
  return call.command === 'help' || housekeeping[call.connector]?.has(call.command) === true;
}

/** A result the conversation shows as a call card. */
export function isCallCard(message: Message, calls: ReadonlyMap<string, CallView>): boolean {
  return message.kind === 'toolResult' && !isHousekeeping(message, calls) && artifactOf(message) === undefined && answeredQuestion(message, calls) === undefined && extensionCardOf(message) === undefined;
}

// A reply with no text: its calls, with or without thinking.
const noText = (message: Message): boolean => message.kind === 'assistant' && textOf(message.content['content']) === '';

/** The conversation's rows: each message, a headline, or a fold of the call cards that come one after another. */
export function foldedRows(messages: readonly Message[], calls: ReadonlyMap<string, CallView>): Row[] {
  const rows: Row[] = [];
  let run: Message[] = [];
  let headline: Extract<Row, { kind: 'headline' }> | undefined;
  const flush = (): void => {
    if (run.filter((message) => isCallCard(message, calls)).length >= 2) rows.push({ kind: 'fold', messages: run });
    else for (const message of run) rows.push({ kind: 'message', message });
    run = [];
  };
  for (const message of messages) {
    if (isHousekeeping(message, calls)) continue;
    if (isCallCard(message, calls)) {
      run.push(message);
      continue;
    }
    if (!noText(message)) {
      flush();
      headline = undefined;
      rows.push({ kind: 'message', message });
      continue;
    }
    const thinking = thinkingOf(message);
    const said = headlinesOf(thinking).at(-1);
    if (said === undefined && headline === undefined) run.push(message);
    else if (said === undefined || said === headline?.headline) {
      headline?.ids.push(message.id);
      headline?.thinking.push(thinking);
    }
    else {
      flush();
      headline = { kind: 'headline', ids: [message.id], headline: said, thinking: [thinking] };
      rows.push(headline);
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
    // The agent's own invalid request is quiet, and a line that exited with another code calm, so neither is a failure
    // here either (ADR 0079, 2; ADR 0102, 15).
    if (card.failed && !exitedOnly(card) && callFailure(card.output).kind !== 'invalid') tally.failed += 1;
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
