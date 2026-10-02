import type { Message } from '../../src/index.ts';
import { callTitle } from './call-title.ts';

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

/** What an answer's tool call said, by tool call id: the command, and the title and description for the person (ADR 0009, 143). */
export type CallInfo = { command: string; title?: string; description?: string };

function labels(source: Record<string, unknown>): { title?: string; description?: string } {
  const description = typeof source['description'] === 'string' && source['description'].trim() !== '' ? source['description'] : undefined;
  const title = callTitle(typeof source['title'] === 'string' ? source['title'] : undefined, description);
  return { ...(title === undefined ? {} : { title }), ...(description === undefined ? {} : { description }) };
}

export function callInfos(messages: readonly Message[]): Map<string, CallInfo> {
  const infos = new Map<string, CallInfo>();
  for (const message of messages) {
    if (message.kind !== 'assistant') continue;
    for (const block of blocks(message.content['content'])) {
      const args = record(block['arguments']);
      if (block['type'] === 'toolCall' && typeof block['id'] === 'string' && typeof args?.['command'] === 'string') infos.set(block['id'], { command: args['command'], ...labels(args) });
    }
  }
  return infos;
}

export type ResultCard = { command: string; title?: string; description?: string; exitCode?: number; durationMs?: number; output: string; background?: boolean };

/** A tool result as its card shows it: the shell's details, or the call's own words and the result text. */
export function resultCard(message: Message, calls: ReadonlyMap<string, CallInfo>): ResultCard {
  const details = record(message.content['details']);
  const text = textOf(message.content['content']);
  const exit = /\[exit code (\d+)\]$/.exec(text);
  const call = calls.get(String(message.content['toolCallId']));
  if (details !== undefined) {
    return {
      command: typeof details['command'] === 'string' ? details['command'] : (call?.command ?? ''),
      output: typeof details['output'] === 'string' ? details['output'] : text,
      ...labels(details),
      ...(typeof details['exitCode'] === 'number' ? { exitCode: details['exitCode'] } : {}),
      ...(typeof details['durationMs'] === 'number' ? { durationMs: details['durationMs'] } : {}),
      ...(details['mode'] === 'async' ? { background: true } : {}),
    };
  }
  return { command: call?.command ?? '', output: text.replace(/\n?\[exit code \d+\]$/, ''), ...(call === undefined ? {} : labels(call)), ...(exit === null ? {} : { exitCode: Number(exit[1]) }) };
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
