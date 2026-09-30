import { z } from '@kvman/sdk';

// pi-ai's message JSON (plan 07 §7.1, ADR 0009, 58): user, assistant, and toolResult messages with their text, image,
// thinking, and toolCall blocks. An object keeps only these fields, so pi-ai's diagnostics never leave kvai. Optional
// fields are exact, as pi-ai's types are.

const textBlockSchema = z.object({ type: z.literal('text'), text: z.string(), textSignature: z.string().exactOptional() });

const thinkingBlockSchema = z.object({
  type: z.literal('thinking'),
  thinking: z.string(),
  thinkingSignature: z.string().exactOptional(),
  redacted: z.boolean().exactOptional(),
});

const imageBlockSchema = z.object({ type: z.literal('image'), data: z.string(), mimeType: z.string() });

const toolCallBlockSchema = z.object({
  type: z.literal('toolCall'),
  id: z.string(),
  name: z.string(),
  arguments: z.record(z.string(), z.json()),
  thoughtSignature: z.string().exactOptional(),
});

const tokens = z.number().int().nonnegative();
const dollars = z.number().nonnegative();

/** pi-ai's usage of one call: tokens by kind and their cost in US dollars. */
export const piUsageSchema = z.object({
  input: tokens,
  output: tokens,
  cacheRead: tokens,
  cacheWrite: tokens,
  cacheWrite1h: tokens.exactOptional(),
  reasoning: tokens.exactOptional(),
  totalTokens: tokens,
  cost: z.object({ input: dollars, output: dollars, cacheRead: dollars, cacheWrite: dollars, total: dollars }),
});

/** How a returned answer ended. */
export const stopReasonSchema = z.enum(['stop', 'length', 'toolUse']);

const assistantFields = {
  role: z.literal('assistant'),
  content: z.array(z.discriminatedUnion('type', [textBlockSchema, thinkingBlockSchema, toolCallBlockSchema])),
  api: z.string(),
  provider: z.string(),
  model: z.string(),
  responseId: z.string().exactOptional(),
  usage: piUsageSchema,
  timestamp: z.number(),
};

/** The assistant message kvai returns. */
export const assistantMessageSchema = z.object({ ...assistantFields, stopReason: stopReasonSchema });

// A harness may send back an answer that ended with an error or an abort (pi-ai continues from those).
const sentAssistantMessageSchema = z.object({ ...assistantFields, stopReason: z.enum(['stop', 'length', 'toolUse', 'error', 'aborted']) });

const userMessageSchema = z.object({
  role: z.literal('user'),
  content: z.union([z.string(), z.array(z.discriminatedUnion('type', [textBlockSchema, imageBlockSchema]))]),
  timestamp: z.number(),
});

const toolResultMessageSchema = z.object({
  role: z.literal('toolResult'),
  toolCallId: z.string(),
  toolName: z.string(),
  content: z.array(z.discriminatedUnion('type', [textBlockSchema, imageBlockSchema])),
  details: z.json().exactOptional(),
  isError: z.boolean(),
  timestamp: z.number(),
});

/** A message of the context sent to a model. */
export const messageSchema = z.discriminatedUnion('role', [userMessageSchema, sentAssistantMessageSchema, toolResultMessageSchema]);

/** A tool the model may call; `parameters` is JSON Schema. */
export const toolSchema = z.object({ name: z.string().min(1), description: z.string(), parameters: z.record(z.string(), z.json()) });
