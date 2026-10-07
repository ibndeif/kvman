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

export type ResultCard = CallView & { output: string; failed: boolean; durationMs?: number };

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
  };
}

export type AnsweredQuestion = { kind: AskKind; question: Record<string, unknown>; answer: Record<string, unknown> };

// What a question dismissed by a message returns (plan 08 §8.1); an answer and a Skip are JSON.
const dismissedByMessage = 'dismissed by the user';

function answerOf(text: string): Record<string, unknown> | undefined {
  if (text === dismissedByMessage) return { dismissed: true };
  try {
    return record(JSON.parse(text));
  } catch {
    return undefined;
  }
}

/** An `ask` call's result as the question and the person's answer (ADR 0013, 1), or nothing for any other result. */
export function answeredQuestion(message: Message, calls: ReadonlyMap<string, CallView>): AnsweredQuestion | undefined {
  if (message.kind !== 'toolResult' || message.content['isError'] === true) return undefined;
  const ask = calls.get(String(message.content['toolCallId']))?.ask;
  if (ask === undefined) return undefined;
  const answer = answerOf(textOf(message.content['content']));
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

// The files a person's message names at its end are stored under an English line for the model (ADR 0018, 4).
const attachedFiles = /\n\nAttached files:\n((?:- .+\n?)+)$/;

/** A person's message as the page shows it: the line above its attached files is in the page's language (ADR 0035, 2). */
export function shownUserText(text: string, label: string): string {
  return text.replace(attachedFiles, (_whole, files: string) => `\n\n${label}\n${files}`);
}

/** The id of the run a background result is of: its job, or its subagent's session (ADR 0036, 14). */
export function backgroundRef(message: Message): string | undefined {
  if (message.kind !== 'user') return undefined;
  if (message.source?.kind === 'job') return message.source.jobId;
  return message.source?.kind === 'subagent' ? message.source.sessionId : undefined;
}

// A background result's text, as kvcoder writes it for the model (`backgroundText`): the call's own words come first.
const backgroundCall = /^The background call `([\s\S]*?)` \(job [^)\n]+\) finished:\n/;

/** What a finished background job or helper was called, for its card's title (ADR 0035, 7); nothing for a message with no such first line. */
export function backgroundName(message: Message): string | undefined {
  const name = backgroundCall.exec(textOf(message.content['content']))?.[1]?.trim();
  return name === undefined || name === '' ? undefined : name;
}
