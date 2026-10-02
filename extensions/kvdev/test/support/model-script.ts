import { z } from '@kvman/sdk';
import type { FakeOpenAI, FakeReply } from '@kvman/testkit/fake-openai';

// Fake model replies for the walkthrough, and the tool results that reached the model.

let counter = 0;

/** A reply that calls the shell tool once with `command`. */
export function calls(command: string): FakeReply {
  counter += 1;
  return { chunks: [{ toolCall: { id: `call-${String(counter)}`, name: 'bash', arguments: { title: 'A walkthrough step', description: 'A walkthrough step.', command } } }] };
}

/** A reply of plain text. */
export function says(text: string): FakeReply {
  return { chunks: [{ text }] };
}

const messageSchema = z.object({ role: z.string(), content: z.unknown().optional() });
const bodySchema = z.object({ messages: z.array(messageSchema) });

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.flatMap((part) => (typeof part === 'object' && part !== null && 'text' in part && typeof part.text === 'string' ? [part.text] : [])).join('\n');
}

/** The tool results the last request to the model holds, in order. */
export function toolResults(fake: FakeOpenAI): string[] {
  const request = fake.requests().at(-1);
  if (request === undefined) return [];
  return bodySchema.parse(request.body).messages.filter((message) => message.role === 'tool').map((message) => textOf(message.content));
}
