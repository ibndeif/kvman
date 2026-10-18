import type { Json } from '@kvman/sdk';
import type { MessageDoc } from '../schemas/records.ts';

// What is sent of a message, for compaction's count (plan 08 §8.1; ADR 0033, 6): its text, and for an assistant
// message its thinking and each call's name and arguments. A tool result's `details`, signatures, and the stored
// metadata never reach the model, so they aren't counted. An image counts a fixed size (ADR 0087, 2).

function blockCharacters(block: Json): number {
  if (typeof block !== 'object' || block === null || Array.isArray(block)) return 0;
  if (block['type'] === 'text' && typeof block['text'] === 'string') return block['text'].length;
  if (block['type'] === 'thinking' && typeof block['thinking'] === 'string') return block['thinking'].length;
  if (block['type'] === 'toolCall') return String(block['name'] ?? '').length + JSON.stringify(block['arguments'] ?? {}).length;
  return 0;
}

/** What one image a message shows counts, as 1,600 tokens of four characters (ADR 0087, 2). */
export const imageCharacters = 6400;

function textCharacters(content: Json | undefined): number {
  if (typeof content === 'string') return content.length;
  return Array.isArray(content) ? content.reduce<number>((total, block) => total + blockCharacters(block), 0) : 0;
}

/** The characters of a message that a step sends the model, its images counted as `imageCharacters` each. */
export function sentCharacters(message: Pick<MessageDoc, 'content'> & { fileIds?: readonly string[] | null }): number {
  return textCharacters(message.content['content']) + (message.fileIds?.length ?? 0) * imageCharacters;
}
