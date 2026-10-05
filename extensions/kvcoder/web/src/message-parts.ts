import type { Message } from '../../src/index.ts';
import { callView, type CallView } from './call-view.ts';

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

/** What each tool call of the answers was, by tool call id (ADR 0011, 13). */
export function callViews(messages: readonly Message[]): Map<string, CallView> {
  const views = new Map<string, CallView>();
  for (const message of messages) {
    if (message.kind !== 'assistant') continue;
    for (const block of blocks(message.content['content'])) {
      const args = record(block['arguments']);
      if (block['type'] === 'toolCall' && typeof block['id'] === 'string' && args !== undefined) views.set(block['id'], callView(args));
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
    ...(typeof description === 'string' ? { description } : {}),
    ...(typeof command === 'string' ? { label: `${connector} · ${command}` } : {}),
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
    output: typeof details?.['output'] === 'string' ? details['output'] : text.replace(/\n?\[exit code \d+\]$/, ''),
    failed: message.content['isError'] === true || (exitCode !== undefined && exitCode !== 0),
    ...(typeof details?.['durationMs'] === 'number' ? { durationMs: details['durationMs'] } : {}),
  };
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
