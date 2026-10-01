import { z } from '@kvman/sdk';
import type { FakeOpenAI, FakeReply } from '@kvman/testkit/fake-openai';

// Fake model replies and what reached the model, as the OpenAI Chat Completions wire has them.

let counter = 0;

/** A reply that calls the shell tool once per command, in order. */
export function calls(...commands: readonly (string | { command: string; timeoutMs?: number })[]): FakeReply {
  return {
    chunks: commands.map((entry) => {
      const call = typeof entry === 'string' ? { command: entry } : entry;
      counter += 1;
      return { toolCall: { id: `call-${counter}`, name: 'bash', arguments: { description: 'A test call.', ...call } } };
    }),
  };
}

/** A reply of plain text. */
export function says(text: string): FakeReply {
  return { chunks: [{ text }] };
}

const wireMessageSchema = z.object({ role: z.string(), content: z.unknown().optional(), tool_call_id: z.string().optional(), tool_calls: z.array(z.unknown()).optional() });
const bodySchema = z.object({ messages: z.array(wireMessageSchema) });

export type WireMessage = z.output<typeof wireMessageSchema>;

/** The messages of the model request at `index` (negative from the end). */
export function requestMessages(fake: FakeOpenAI, index = -1): WireMessage[] {
  const request = fake.requests().at(index);
  return request === undefined ? [] : bodySchema.parse(request.body).messages;
}

/** A wire message's text. */
export function textOf(message: WireMessage | undefined): string {
  const content = message?.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.flatMap((part) => (typeof part === 'object' && part !== null && 'text' in part && typeof part.text === 'string' ? [part.text] : [])).join('\n');
}

/** The tool results of a request, in order. */
export function toolResults(fake: FakeOpenAI, index = -1): string[] {
  return requestMessages(fake, index).filter((message) => message.role === 'tool').map(textOf);
}

/** The system prompt of a request. */
export function systemPrompt(fake: FakeOpenAI, index = -1): string {
  return textOf(requestMessages(fake, index).find((message) => message.role === 'system' || message.role === 'developer'));
}
