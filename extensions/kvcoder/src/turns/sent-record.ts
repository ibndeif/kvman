import { createHash } from 'node:crypto';
import type { SentRecord } from '../schemas/sent-record.ts';

// What a step's model call was sent, kept on its reply so a cache miss can be explained (plan 08 §8.2, ADR 0108, 8):
// a kvman-side change shows as `prefixKept: false`, a provider's drop as `true` with no cached tokens.

const hashOf = (value: unknown): string => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** The record of a call sent with `systemPrompt`, `tools`, and `messages`, after a call that recorded `previous`. */
export function sentRecord(systemPrompt: string, tools: unknown, messages: readonly unknown[], previous: SentRecord | null | undefined): SentRecord {
  const promptHash = hashOf([systemPrompt, tools]);
  const prefixKept = previous !== null && previous !== undefined && previous.promptHash === promptHash && messages.length >= previous.messageCount && hashOf(messages.slice(0, previous.messageCount)) === previous.messagesHash;
  return { promptHash, messagesHash: hashOf(messages), messageCount: messages.length, prefixKept };
}
