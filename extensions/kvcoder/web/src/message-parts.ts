import type { Json, JsonObject } from '@kvman/sdk';
import type { Message } from '../../src/index.ts';
import { callView, type AskKind, type CallView } from './call-view.ts';

// Reading the parts of stored messages: an answer's text, thinking, and tool calls; a tool result's text and card.

type Block = Record<string, unknown>;

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : undefined;
}

function blocks(content: unknown): Block[] {
  return Array.isArray(content) ? content.flatMap((block: unknown) => {
    const found = record(block);
    return found === undefined ? [] : [found];
  }) : [];
}

/** The text of a message's content: a string, or its text blocks. */
export function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  return blocks(content).flatMap((block) => (block['type'] === 'text' && typeof block['text'] === 'string' ? [block['text']] : [])).join('\n');
}

/** A reply's headlines: the lines of its thinking that are wholly bold, as GPT's summaries begin each part (ADR 0102, 1). */
export function headlinesOf(thinking: string): string[] {
  return thinking.split('\n').flatMap((line) => {
    const found = /^\*\*([^*]+)\*\*$/.exec(line.trim());
    return found?.[1] === undefined || found[1].trim() === '' ? [] : [found[1].trim()];
  });
}

/** The newest headline of a running turn: the streaming thinking's, else its last reply's that had one. */
export function latestHeadline(streaming: string, messages: readonly Message[], turnId: string | undefined): string | undefined {
  const live = headlinesOf(streaming).at(-1);
  if (live !== undefined || turnId === undefined) return live;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message === undefined || message.turnId !== turnId) return undefined;
    if (message.kind === 'assistant') {
      const said = headlinesOf(thinkingOf(message)).at(-1);
      if (said !== undefined) return said;
    }
  }
  return undefined;
}

export function thinkingOf(message: Message): string {
  return blocks(message.content['content']).flatMap((block) => (block['type'] === 'thinking' && typeof block['thinking'] === 'string' ? [block['thinking']] : [])).join('\n');
}

/** What each tool call of the answers was, and how long its answer took, by tool call id (ADR 0011, 13; ADR 0017, 1). */
export function callViews(messages: readonly Message[]): Map<string, CallView> {
  const views = new Map<string, CallView>();
  for (const message of messages) {
    if (message.kind !== 'assistant') continue;
    const written = typeof message.durationMs === 'number' ? { writtenMs: message.durationMs } : {};
    for (const block of blocks(message.content['content'])) {
      const args = record(block['arguments']);
      if (block['type'] === 'toolCall' && typeof block['id'] === 'string' && args !== undefined) views.set(block['id'], { ...callView(args), ...written });
    }
  }
  return views;
}

/** `exitCode` and `timedOut` are a line's, so a line that exited with another code reads calmly (ADR 0102, 15). */
export type ResultCard = CallView & { output: string; failed: boolean; durationMs?: number; exitCode?: number; timedOut?: true };

// A result's own words: the `run` tool's details name the call, whose payload the call itself holds; an old shell
// result's details hold its title and command.
function detailsView(details: Record<string, unknown>, call: CallView | undefined): CallView {
  const { description, connector, command } = details;
  if (typeof connector !== 'string') return { ...call, ...callView(details) };
  return {
    ...call,
    connector,
    ...(typeof description === 'string' ? { description } : {}),
    ...(typeof command === 'string' ? { command, label: `${connector} · ${command}` } : {}),
    ...(details['background'] === true ? { background: true } : {}),
  };
}

/** A tool result as its card shows it: the call it answers, its output, and whether it failed. */
export function resultCard(message: Message, calls: ReadonlyMap<string, CallView>): ResultCard {
  const details = record(message.content['details']);
  const text = textOf(message.content['content']);
  const exit = /\n?\[exit code (\d+)\]$/.exec(text);
  const call = calls.get(String(message.content['toolCallId']));
  const exitCode = typeof details?.['exitCode'] === 'number' ? details['exitCode'] : exit === null ? undefined : Number(exit[1]);
  return {
    ...(details === undefined ? call : detailsView(details, call)),
    output: typeof details?.['output'] === 'string' ? details['output'] : details === undefined ? text.replace(/\n?\[exit code \d+\]$/, '') : text,
    failed: message.content['isError'] === true || (exitCode !== undefined && exitCode !== 0),
    ...(typeof details?.['durationMs'] === 'number' ? { durationMs: details['durationMs'] } : {}),
    ...(exitCode === undefined ? {} : { exitCode }),
    ...(details?.['timedOut'] === true ? { timedOut: true as const } : {}),
  };
}

/** Whether a failed card is a line that ran to its end and exited with another code than 0 (ADR 0102, 15). */
export const exitedOnly = (card: Pick<ResultCard, 'failed' | 'line' | 'exitCode' | 'timedOut'>): boolean => card.failed && card.line !== undefined && card.exitCode !== undefined && card.exitCode !== 0 && card.timedOut !== true;

export type AnsweredQuestion = { kind: AskKind; question: Record<string, unknown>; answer: Record<string, unknown> };

// What a question dismissed by a message returns (plan 08 §8.1); an answer and a Skip are JSON.
const dismissedByMessage = 'dismissed by the user';

function answerOf(text: string): Record<string, unknown> | undefined {
  if (text === dismissedByMessage) return { dismissed: true };
  // The answer is the result's first line; a note to the model may follow it (ADR 0058, 4). An older result is the JSON alone.
  for (const candidate of [text, text.split('\n', 1)[0] ?? '']) {
    try {
      return record(JSON.parse(candidate));
    } catch {
      continue;
    }
  }
  return undefined;
}

/** An `ask` call's result as the question and the person's answer (ADR 0013, 1), or nothing for any other result. */
export function answeredQuestion(message: Message, calls: ReadonlyMap<string, CallView>): AnsweredQuestion | undefined {
  if (message.kind !== 'toolResult') return undefined;
  const ask = calls.get(String(message.content['toolCallId']))?.ask;
  if (ask === undefined) return undefined;
  const text = textOf(message.content['content']);
  // A dismissed question is stored as a failed call, but the person reads it as skipped (ADR 0079, 3).
  if (message.content['isError'] === true && text !== dismissedByMessage) return undefined;
  const answer = answerOf(text);
  return answer === undefined ? undefined : { ...ask, answer };
}

/** Whether a user message is kvcoder's own word to the model, such as the hint after a lost reply (ADR 0009, 188). */
export function isKvcoderHint(message: Message): boolean {
  return message.kind === 'user' && message.source?.kind === 'extension' && message.source.name === '@kvman/kvcoder';
}

/** Whether a user message is a background result (ADR 0009, 89). */
export function isBackground(message: Message): boolean {
  return message.kind === 'user' && (message.source?.kind === 'job' || message.source?.kind === 'subagent');
}

export type ArtifactRef = { id: string; title: string; format: 'markdown' | 'html' | 'url'; version: number };

/** An artifact write or edit result's card details (ADR 0009, 177), or nothing for any other message. */
export function artifactOf(message: Message): ArtifactRef | undefined {
  if (message.kind !== 'toolResult') return undefined;
  const details = record(message.content['details']);
  if (details === undefined) return undefined;
  const found = record(details['artifact']);
  if (found === undefined) return undefined;
  const { id, title, format, version } = found;
  if (typeof id !== 'string' || typeof title !== 'string' || typeof version !== 'number') return undefined;
  if (format !== 'markdown' && format !== 'html' && format !== 'url') return undefined;
  return { id, title, format, version };
}

/** An extension's own card for a successful call (ADR 0082, 13): its component, with the call's payload and output. */
export type ExtensionCard = { component: string; props: { payload: Json; output: Json } };

/** The card a successful call of a registered command with `card` shows instead of the call card. */
const jsonObject = (value: Json | undefined): JsonObject | undefined => (typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined);

export function extensionCardOf(message: Message): ExtensionCard | undefined {
  if (message.kind !== 'toolResult' || message.content['isError'] === true) return undefined;
  const found = jsonObject(jsonObject(message.content['details'])?.['card']);
  const component = found?.['component'];
  if (found === undefined || typeof component !== 'string') return undefined;
  return { component, props: { payload: found['payload'] ?? null, output: found['output'] ?? null } };
}

// The files a person's message names at its end are stored under an English line for the model (ADR 0018, 4).
const attachedFiles = /\n\nAttached files:\n((?:- .+\n?)+)$/;

/** A person's message as the page shows it: the line above its attached files is in the page's language (ADR 0035, 2). */
export function shownUserText(text: string, label: string): string {
  return text.replace(attachedFiles, (_whole, files: string) => `\n\n${label}\n${files}`);
}

/** The text the person last typed in the chat, without the files line kvcoder added, for Up in the send box (ADR 0090, 6). */
export function lastTyped(messages: readonly Message[]): string | undefined {
  const last = messages.findLast((message) => message.kind === 'user' && message.source?.kind === 'user');
  return last === undefined ? undefined : typedText(textOf(last.content['content']));
}

/** A person's message as they typed it, without the files line kvcoder added. */
export const typedText = (text: string): string => text.replace(attachedFiles, '');

/** The id of the run a background result is of: its job, or its subagent's session (ADR 0036, 14). */
export function backgroundRef(message: Message): string | undefined {
  if (message.kind !== 'user') return undefined;
  if (message.source?.kind === 'job') return message.source.jobId;
  return message.source?.kind === 'subagent' ? message.source.sessionId : undefined;
}

// A background result's text, as kvcoder writes it for the model (`backgroundText`): the call's own words come first.
const backgroundCall = /^The background call `([\s\S]*?)` \(job [^)\n]+\) finished:\n/;

// The message kvcoder writes for the runs that ended while kvman was stopped (`reportInterrupted`), one line per run.
const stoppedHeader = 'While kvman was stopped, these background calls ended:\n';

/** How many runs a "while kvman was stopped" message reports; nothing for any other text (ADR 0112, 5). */
export function stoppedRunsCount(text: string): number | undefined {
  if (!text.startsWith(stoppedHeader)) return undefined;
  return text.split('\n').filter((line) => line.startsWith('- `')).length;
}

/** What a finished background job or helper was called, for its card's title (ADR 0035, 7); nothing for a message with no such first line. */
export function backgroundName(message: Message): string | undefined {
  const name = backgroundCall.exec(textOf(message.content['content']))?.[1]?.trim();
  return name === undefined || name === '' ? undefined : name;
}

/** The run a tool result says changed what is staged in Git (ADR 0060, 4). */
export function stagingRunOf(message: Message): string | undefined {
  const runId = record(record(message.content['details'])?.['staging'])?.['runId'];
  return typeof runId === 'string' ? runId : undefined;
}
