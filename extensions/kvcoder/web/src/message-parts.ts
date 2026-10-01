import type { Message } from '../../src/index.ts';

// Reading the parts of stored messages: an answer's text, thinking, and tool calls; a tool result's text and card.

type Block = Record<string, unknown>;

function blocks(content: unknown): Block[] {
  if (!Array.isArray(content)) return [];
  return content.flatMap((block: unknown) => (typeof block === 'object' && block !== null && !Array.isArray(block) ? [Object.fromEntries(Object.entries(block))] : []));
}

/** The text of a message's content: a string, or its text blocks. */
export function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  return blocks(content).flatMap((block) => (block['type'] === 'text' && typeof block['text'] === 'string' ? [block['text']] : [])).join('\n');
}

export function thinkingOf(message: Message): string {
  return blocks(message.content['content']).flatMap((block) => (block['type'] === 'thinking' && typeof block['thinking'] === 'string' ? [block['thinking']] : [])).join('\n');
}

/** The commands an answer called, by tool call id. */
export function callCommands(messages: readonly Message[]): Map<string, string> {
  const commands = new Map<string, string>();
  for (const message of messages) {
    if (message.kind !== 'assistant') continue;
    for (const block of blocks(message.content['content'])) {
      const args = block['arguments'];
      if (block['type'] === 'toolCall' && typeof block['id'] === 'string' && typeof args === 'object' && args !== null && 'command' in args && typeof args.command === 'string') commands.set(block['id'], args.command);
    }
  }
  return commands;
}

export type ResultCard = { command: string; exitCode?: number; durationMs?: number; output: string };

/** A tool result as its card shows it: the shell's details, or the command and the result text. */
export function resultCard(message: Message, commands: ReadonlyMap<string, string>): ResultCard {
  const details = message.content['details'];
  const text = textOf(message.content['content']);
  const exit = /\[exit code (\d+)\]$/.exec(text);
  const command = commands.get(String(message.content['toolCallId'])) ?? '';
  if (typeof details === 'object' && details !== null && !Array.isArray(details)) {
    const output = typeof details['output'] === 'string' ? details['output'] : text;
    return { command: typeof details['command'] === 'string' ? details['command'] : command, output, ...(typeof details['exitCode'] === 'number' ? { exitCode: details['exitCode'] } : {}), ...(typeof details['durationMs'] === 'number' ? { durationMs: details['durationMs'] } : {}) };
  }
  return { command, output: text.replace(/\n?\[exit code \d+\]$/, ''), ...(exit === null ? {} : { exitCode: Number(exit[1]) }) };
}

/** Whether a user message is a background result (ADR 0009, 89). */
export function isBackground(message: Message): boolean {
  return message.kind === 'user' && (message.source?.kind === 'job' || message.source?.kind === 'subagent');
}
