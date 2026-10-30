import type { Stored } from '@kvman/sdk';
import type { JsonValue } from '../connector-call.ts';
import type { MessageDoc, TurnDoc } from '../schemas/records.ts';

// Finished turns sent collapsed (plan 08 §8.1, ADR 0108, 5): at or before the chat's `collapsedThroughSeq`, a turn is
// the person's messages and its final answer, with the files it changed; its calls, results, reasoning, and background
// messages aren't sent. `mcp tools` lookups stay whole, so a server's tools are looked up once a chat (ADR 0108, 7).
// The stored messages don't change.

type Fields = { [key: string]: JsonValue };
const fields = (value: JsonValue | undefined): Fields => (typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {});
const blocksOf = (message: Pick<MessageDoc, 'content'>): JsonValue[] => {
  const content = message.content['content'];
  return Array.isArray(content) ? content : [];
};

const isToolsLookupBlock = (block: JsonValue): boolean => {
  const call = fields(block);
  const args = fields(call['arguments']);
  return call['type'] === 'toolCall' && args['connector'] === 'mcp' && args['command'] === 'tools';
};

/** The ids of the `mcp tools` calls among the messages: their results are never cleared or collapsed. */
export function toolsLookups(messages: readonly Pick<MessageDoc, 'kind' | 'content'>[]): Set<string> {
  const ids = new Set<string>();
  for (const message of messages) if (message.kind === 'assistant') for (const block of blocksOf(message)) if (isToolsLookupBlock(block)) ids.add(String(fields(block)['id']));
  return ids;
}

const textOfBlocks = (blocks: readonly JsonValue[]): string => blocks.flatMap((block) => (fields(block)['type'] === 'text' && typeof fields(block)['text'] === 'string' ? [String(fields(block)['text'])] : [])).join('\n');

/**
 * The turns that may be collapsed: every ended turn up to and including the newest that ended `done`, except the newest
 * ended turn, so a "Continue." after a failure or a stop finds its turn whole.
 */
export function collapsibleTurns(turns: readonly Pick<Stored<TurnDoc>, 'id' | 'outcome' | 'startedAt'>[]): string[] {
  const ended = turns.filter((turn) => turn.outcome !== null).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const newestDone = ended.findLastIndex((turn) => turn.outcome === 'done');
  return ended.slice(0, Math.min(newestDone + 1, ended.length - 1)).map((turn) => turn.id);
}

// Each collapsed turn's final answer: its last reply with text.
function finalAnswers(messages: readonly Stored<MessageDoc>[], collapsedThrough: number): Map<string, string> {
  const last = new Map<string, string>();
  for (const message of messages) if (message.seq <= collapsedThrough && message.kind === 'assistant' && message.turnId !== null && textOfBlocks(blocksOf(message)).trim() !== '') last.set(message.turnId, message.id);
  return last;
}

const filesLine = (paths: readonly string[] | undefined): string => (paths === undefined || paths.length === 0 ? '' : `\n\n[kvman: files changed in this turn: ${paths.join(', ')}]`);

function collapsedMessage(message: Stored<MessageDoc>, finals: ReadonlyMap<string, string>, lookups: ReadonlySet<string>, files: ReadonlyMap<string, readonly string[]>): Stored<MessageDoc> | undefined {
  if (message.kind === 'user') return message.source?.kind === 'user' ? message : undefined;
  if (message.kind === 'toolResult') return lookups.has(String(message.content['toolCallId'])) ? message : undefined;
  if (message.kind !== 'assistant') return undefined;
  const blocks = blocksOf(message);
  const kept = blocks.filter(isToolsLookupBlock);
  const final = message.turnId !== null && finals.get(message.turnId) === message.id;
  if (final) return { ...message, content: { ...message.content, content: [{ type: 'text', text: `${textOfBlocks(blocks)}${filesLine(files.get(message.turnId ?? ''))}` }] } };
  return kept.length === 0 ? undefined : { ...message, content: { ...message.content, content: kept } };
}

/** The messages as they are sent with the turns at or before `collapsedThrough` collapsed. */
export function collapsedView(messages: readonly Stored<MessageDoc>[], collapsedThrough: number, files: ReadonlyMap<string, readonly string[]>): Stored<MessageDoc>[] {
  if (collapsedThrough < 0) return [...messages];
  const finals = finalAnswers(messages, collapsedThrough);
  const lookups = toolsLookups(messages);
  return messages.flatMap((message) => {
    if (message.seq > collapsedThrough) return [message];
    const shown = collapsedMessage(message, finals, lookups, files);
    return shown === undefined ? [] : [shown];
  });
}
