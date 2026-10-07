import type { Json } from '@kvman/sdk';
import type { MessageDoc } from '../schemas/records.ts';

// What is sent of a message, for compaction's count (plan 08 §8.1; ADR 0033, 6): its text, and for an assistant
// message its thinking and each call's name and arguments. A tool result's `details`, signatures, and the stored
// metadata never reach the model, so they aren't counted.

function blockCharacters(block: Json): number {
  if (typeof block !== 'object' || block === null || Array.isArray(block)) return 0;
  if (block['type'] === 'text' && typeof block['text'] === 'string') return block['text'].length;
  if (block['type'] === 'thinking' && typeof block['thinking'] === 'string') return block['thinking'].length;
  if (block['type'] === 'toolCall') return String(block['name'] ?? '').length + JSON.stringify(block['arguments'] ?? {}).length;
  return 0;
}

/** The characters of a message that a step sends the model. */
export function sentCharacters(message: Pick<MessageDoc, 'content'>): number {
  const content = message.content['content'];
  if (typeof content === 'string') return content.length;
  return Array.isArray(content) ? content.reduce<number>((total, block) => total + blockCharacters(block), 0) : 0;
}
