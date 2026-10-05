import { z, type Json } from '@kvman/sdk';
import { assistantMessageSchema, messageSchema, stopReasonSchema, toolSchema } from './messages.ts';

// `kvai.complete`'s input and output (plan 07 §7.1). A delegate command takes and returns the same shapes.

/** How hard a reasoning model thinks; `off` (the default) turns thinking off. */
export const thinkingSchema = z.enum(['off', 'minimal', 'low', 'medium', 'high']);

/** `kvai.complete`'s input. */
export const completeInputSchema = z.object({
  model: z.string().min(1).exactOptional(),
  systemPrompt: z.string().exactOptional(),
  messages: z.array(messageSchema),
  tools: z.array(toolSchema).exactOptional(),
  thinking: thinkingSchema.exactOptional(),
  maxTokens: z.number().int().positive().exactOptional(),
  sessionId: z.string().min(1).exactOptional(),
});

/** One call's usage: tokens by kind, and the cost in US dollars. */
export const callUsageSchema = z.object({
  input: z.number().int().nonnegative(),
  output: z.number().int().nonnegative(),
  cacheRead: z.number().int().nonnegative(),
  cacheWrite: z.number().int().nonnegative(),
  cost: z.number().nonnegative(),
});

/** `kvai.complete`'s output. */
export const completeOutputSchema = z.object({ message: assistantMessageSchema, stopReason: stopReasonSchema, usage: callUsageSchema });

/** A delta kvai streams to the root job while a call runs. */
export type Delta = { type: 'text'; delta: string } | { type: 'thinking'; delta: string } | { type: 'toolcall'; name: string; arguments?: Record<string, Json> };

export type CompleteInput = z.output<typeof completeInputSchema>;
export type CompleteOutput = z.output<typeof completeOutputSchema>;
export type CallUsage = z.output<typeof callUsageSchema>;
