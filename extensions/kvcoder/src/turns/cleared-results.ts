import type { Json, Stored } from '@kvman/sdk';
import { callName, type JsonFields } from '../calls/call-name.ts';
import type { MessageDoc } from '../schemas/records.ts';
import { sentCharacters } from './sent-size.ts';

// Old tool results sent as a line that names the call (plan 08 §8.1, ADR 0094, 1): the result at or before the chat's
// `clearedThroughSeq` is replaced in what the model is sent, and its call's long texts too (ADR 0097, 4); the stored
// messages are unchanged.

/** Whether the model is sent this message as a cleared result. */
export const isCleared = (message: Pick<MessageDoc, 'kind' | 'seq'>, clearedThrough: number): boolean => message.kind === 'toolResult' && message.seq <= clearedThrough;

/** What a cleared result reads. */
export const clearedText = (call: string): string => `[cleared to save memory: ${call}. Make the call again if you need it.]`;

const fields = (value: Json | undefined): JsonFields => (typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {});

/** Each call of the messages, by its id, named as `background` names a call. */
export function callNames(messages: readonly Stored<MessageDoc>[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const message of messages) {
    const blocks = message.kind === 'assistant' ? message.content['content'] : undefined;
    if (!Array.isArray(blocks)) continue;
    for (const block of blocks) {
      const call = fields(block);
      const args = fields(call['arguments']);
      if (call['type'] !== 'toolCall' || typeof call['id'] !== 'string') continue;
      names.set(call['id'], typeof args['connector'] === 'string' && typeof args['command'] === 'string' ? callName(args['connector'], args['command'], fields(args['payload'])) : String(call['name'] ?? 'a call'));
    }
  }
  return names;
}

/** The ids of the calls whose results are sent cleared. */
export function clearedCalls(messages: readonly Stored<MessageDoc>[], clearedThrough: number): Set<string> {
  return new Set(messages.flatMap((message) => (isCleared(message, clearedThrough) && typeof message.content['toolCallId'] === 'string' ? [message.content['toolCallId']] : [])));
}

/** The longest text a cleared call keeps (ADR 0097, 4). */
export const keptCharacters = 500;

/** A cleared call's payload: every string longer than 500 characters replaced by a line that says how long it was. */
export function clearedPayload(value: Json): Json {
  if (typeof value === 'string') return value.length > keptCharacters ? `[cleared to save memory: ${String(value.length)} characters]` : value;
  if (Array.isArray(value)) return value.map(clearedPayload);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(Object.entries(value).flatMap(([name, field]) => (field === undefined ? [] : [[name, clearedPayload(field)]])));
}

/** The characters a message is sent as, a cleared result counting its line. */
export const sentSize = (message: Stored<MessageDoc>, clearedThrough: number): number => (isCleared(message, clearedThrough) ? clearedText('').length + 40 : sentCharacters(message));
