import { z } from 'zod';
import { blobIdSchema } from './blob-id.ts';
import { descriptionSchema, jsonSchemaDocumentSchema, modelIdSchema, positiveIntegerSchema, providerIdSchema } from './extension/grammar.ts';
import { liveAddressSchema } from './identifiers.ts';
import { jsonObjectSchema } from './json.ts';
import { textSchema } from './text.ts';

export const llmPurposeSchema = z.enum(['chat', 'summary', 'extension', 'child']);
export type LlmPurpose = z.infer<typeof llmPurposeSchema>;

export const thinkingLevelSchema = z.enum(['low', 'medium', 'high']);

export const modelRefSchema = z.strictObject({ provider: providerIdSchema, id: modelIdSchema });
export type ModelRef = z.infer<typeof modelRefSchema>;

export const toolCallSchema = z.strictObject({ id: z.string().min(1), name: z.string().min(1), args: jsonObjectSchema });
export type ToolCall = z.infer<typeof toolCallSchema>;

export const llmContentPartSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('text'), text: z.string() }),
  z.strictObject({ type: z.literal('image'), blobId: blobIdSchema, mime: z.string().min(1) }),
]);

export const llmMessageSchema = z.discriminatedUnion('role', [
  z.strictObject({ role: z.literal('user'), content: z.union([z.string(), z.array(llmContentPartSchema)]) }),
  z.strictObject({
    role: z.literal('assistant'),
    content: z.string(),
    thinking: z.string().exactOptional(),
    toolCalls: z.array(toolCallSchema).exactOptional(),
  }),
  z.strictObject({ role: z.literal('tool'), toolCallId: z.string().min(1), content: z.string(), isError: z.boolean().exactOptional() }),
]);
export type LlmMessage = z.infer<typeof llmMessageSchema>;

export const llmToolSchema = z.strictObject({
  name: z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/, 'provider tool names match ^[a-zA-Z0-9_-]{1,64}$'),
  description: z.string(),
  input: jsonSchemaDocumentSchema,
});

export const llmRequestSchema = z.strictObject({
  purpose: llmPurposeSchema,
  model: modelRefSchema.exactOptional(),
  system: z.string().exactOptional(),
  messages: z.array(llmMessageSchema),
  tools: z.array(llmToolSchema).exactOptional(),
  thinking: z.enum(['off', ...thinkingLevelSchema.options]).exactOptional(),
  maxTokens: positiveIntegerSchema.exactOptional(),
  live: z.strictObject({ text: liveAddressSchema.exactOptional(), thinking: liveAddressSchema.exactOptional() }).exactOptional(),
});
export type LlmRequest = z.infer<typeof llmRequestSchema>;

const tokenCountSchema = z.number().int().nonnegative();

export const llmResultSchema = z.strictObject({
  content: z.string(),
  thinking: z.string().exactOptional(),
  toolCalls: z.array(toolCallSchema).exactOptional(),
  usage: z.strictObject({
    input: tokenCountSchema,
    output: tokenCountSchema,
    cacheRead: tokenCountSchema.exactOptional(),
    cacheWrite: tokenCountSchema.exactOptional(),
  }),
  costUsd: z.number().nonnegative().exactOptional(),
  model: modelRefSchema,
  stopReason: z.enum(['end', 'tool-calls', 'max-tokens']),
});
export type LlmResult = z.infer<typeof llmResultSchema>;

export const modelDefSchema = z.strictObject({
  provider: providerIdSchema,
  title: textSchema,
  description: descriptionSchema,
  contextWindow: positiveIntegerSchema,
  maxOutput: positiveIntegerSchema,
  cost: z.strictObject({ inputPerMTok: z.number().nonnegative(), outputPerMTok: z.number().nonnegative() }).exactOptional(),
  capabilities: z.strictObject({ tools: z.boolean(), vision: z.boolean(), thinking: z.array(thinkingLevelSchema) }),
});
export type ModelDef = z.infer<typeof modelDefSchema>;

export const providerAuthSchema = z.enum(['api-key', 'oauth', 'none']);
