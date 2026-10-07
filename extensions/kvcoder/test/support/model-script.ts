import { z } from '@kvman/sdk';
import type { FakeOpenAI, FakeReply } from '@kvman/testkit/fake-openai';

// Fake model replies and what reached the model, as the OpenAI Chat Completions wire has them.

let counter = 0;

/** A call of the `run` tool: a connector's command with its payload, and what it tells the person. */
export type RunCallSpec = { connector: string; command: string; payload?: Record<string, unknown>; description?: string };

/** A reply that calls any tool with any arguments, as a model that gets a call wrong does. */
export function rawCall(name: string, args: Record<string, unknown>): FakeReply {
  counter += 1;
  return { chunks: [{ toolCall: { id: `call-${counter}`, name, arguments: args } }] };
}

/** A reply that calls the `run` tool once per call, in order. */
export function runs(...calls: readonly RunCallSpec[]): FakeReply {
  return {
    chunks: calls.map((call) => {
      counter += 1;
      return { toolCall: { id: `call-${counter}`, name: 'run', arguments: { description: call.description ?? 'A test call.', connector: call.connector, command: call.command, ...(call.payload === undefined ? {} : { payload: call.payload }) } } };
    }),
  };
}

/** A call of one connector command. */
export function command(connector: string, name: string, payload?: Record<string, unknown>): RunCallSpec {
  return { connector, command: name, ...(payload === undefined ? {} : { payload }) };
}

/** An `fs` call; a write or an edit runs at once, not risky unless the payload says so. */
export function fsCall(name: 'read' | 'list' | 'search' | 'write' | 'edit', payload: Record<string, unknown> = {}): RunCallSpec {
  return command('fs', name, name === 'write' || name === 'edit' ? { risky: false, ...payload } : payload);
}

/** A `shell exec` call that runs at once: its line, not risky unless the payload says so. */
export function shell(line: string, payload: Record<string, unknown> = {}): RunCallSpec {
  return { connector: 'shell', command: 'exec', payload: { line, risky: false, ...payload } };
}

/** A reply of plain text. */
export function says(text: string): FakeReply {
  return { chunks: [{ text }] };
}

const wireMessageSchema = z.object({ role: z.string(), content: z.unknown().optional(), tool_call_id: z.string().optional(), tool_calls: z.array(z.unknown()).optional() });
const bodySchema = z.object({ messages: z.array(wireMessageSchema), tools: z.array(z.unknown()).optional() });

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

/** A text without the date line a person's message is sent with (ADR 0032, 5). */
export function unstamped(text: string): string {
  return text.replace(/^\[[A-Z][a-z]+day \d{4}-\d{2}-\d{2} \d{2}:\d{2} [+-]\d{2}:\d{2}\]\n/, '');
}

/** The tool results of a request, in order. */
export function toolResults(fake: FakeOpenAI, index = -1): string[] {
  return requestMessages(fake, index).filter((message) => message.role === 'tool').map(textOf);
}

/** The system prompt of a request. */
export function systemPrompt(fake: FakeOpenAI, index = -1): string {
  return textOf(requestMessages(fake, index).find((message) => message.role === 'system' || message.role === 'developer'));
}

/** The tools a request offered the model. */
export function requestTools(fake: FakeOpenAI, index = -1): unknown[] {
  const request = fake.requests().at(index);
  return request === undefined ? [] : (bodySchema.parse(request.body).tools ?? []);
}
