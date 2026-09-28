import { z } from 'zod';
import { manifestSchema } from './extension/manifest.ts';
import { modelIdSchema, packageNameSchema, providerIdSchema } from './extension/grammar.ts';
import type { HostWorkspace, InvokeFrame } from './host-frames.ts';
import { epochMsSchema, ulidSchema, workspaceIdSchema } from './identifiers.ts';
import { jsonSchema } from './json.ts';
import { llmPurposeSchema, modelDefSchema, modelRefSchema, providerAuthSchema } from './llm.ts';
import { problemSchema } from './problem.ts';
import { textSchema } from './text.ts';

// 03 §3.8 and §3.12, ADRs 0152–0154: the kernel's LLM service shapes. The request of `kernel.llm.tokens.count`
// is `llmRequestSchema`; the results of the two list queries are arrays, used inline where they are served.

export const modelInfoSchema = modelDefSchema.extend({
  id: modelIdSchema,
  extension: packageNameSchema,
  source: z.enum(['static', 'listed']),
});
export type ModelInfo = z.infer<typeof modelInfoSchema>;

export const llmModelsListResultSchema = z.array(modelInfoSchema);
export type LlmModelsListResult = z.infer<typeof llmModelsListResultSchema>;

export const llmDefaultsSchema = z.strictObject({
  chat: modelRefSchema.exactOptional(),
  summary: modelRefSchema.exactOptional(),
  extension: modelRefSchema.exactOptional(),
  child: modelRefSchema.exactOptional(),
});
export type LlmDefaults = z.infer<typeof llmDefaultsSchema>;

export const llmProvidersListRequestSchema = z.strictObject({ workspaceId: workspaceIdSchema });
export type LlmProvidersListRequest = z.infer<typeof llmProvidersListRequestSchema>;

export const llmProviderListingSchema = z.strictObject({
  id: providerIdSchema,
  title: textSchema,
  extension: packageNameSchema,
  auth: providerAuthSchema,
  configured: z.boolean(),
});
export type LlmProviderListing = z.infer<typeof llmProviderListingSchema>;

export const llmProvidersListResultSchema = z.array(llmProviderListingSchema);
export type LlmProvidersListResult = z.infer<typeof llmProvidersListResultSchema>;

export const llmModelsListRequestSchema = z.strictObject({ workspaceId: workspaceIdSchema.exactOptional() });
export type LlmModelsListRequest = z.infer<typeof llmModelsListRequestSchema>;

export const llmDefaultsGetRequestSchema = z.strictObject({ workspaceId: workspaceIdSchema.exactOptional() });
export type LlmDefaultsGetRequest = z.infer<typeof llmDefaultsGetRequestSchema>;

export const llmDefaultsGetResultSchema = z.strictObject({
  workspace: llmDefaultsSchema,
  global: llmDefaultsSchema,
  effective: llmDefaultsSchema,
});
export type LlmDefaultsGetResult = z.infer<typeof llmDefaultsGetResultSchema>;

export const llmDefaultsSetRequestSchema = z.strictObject({
  workspaceId: workspaceIdSchema.exactOptional(),
  purpose: llmPurposeSchema,
  model: modelRefSchema.nullable(),
});
export type LlmDefaultsSetRequest = z.infer<typeof llmDefaultsSetRequestSchema>;

export const llmDefaultsSetResultSchema = z.strictObject({});
export type LlmDefaultsSetResult = z.infer<typeof llmDefaultsSetResultSchema>;

export const llmTokensCountResultSchema = z.strictObject({ tokens: z.number().int().nonnegative(), exact: z.boolean() });
export type LlmTokensCountResult = z.infer<typeof llmTokensCountResultSchema>;

export const llmUsageGetRequestSchema = z.strictObject({
  workspaceId: workspaceIdSchema.exactOptional(),
  from: epochMsSchema.exactOptional(),
  to: epochMsSchema.exactOptional(),
  groupBy: z.enum(['model', 'extension', 'day']).exactOptional(),
});
export type LlmUsageGetRequest = z.infer<typeof llmUsageGetRequestSchema>;

const usageCountSchema = z.number().int().nonnegative();

export const llmUsageRowSchema = z.strictObject({
  key: z.string().min(1).nullable(),
  calls: usageCountSchema,
  input: usageCountSchema,
  output: usageCountSchema,
  cacheRead: usageCountSchema,
  cacheWrite: usageCountSchema,
  costUsd: z.number().nonnegative(),
});
export type LlmUsageRow = z.infer<typeof llmUsageRowSchema>;

export const llmUsageGetResultSchema = z.strictObject({ rows: z.array(llmUsageRowSchema) });
export type LlmUsageGetResult = z.infer<typeof llmUsageGetResultSchema>;

export const llmModelsRefreshRequestSchema = z.strictObject({ provider: providerIdSchema.exactOptional() });
export type LlmModelsRefreshRequest = z.infer<typeof llmModelsRefreshRequestSchema>;

export const llmModelsRefreshResultSchema = z.strictObject({});
export type LlmModelsRefreshResult = z.infer<typeof llmModelsRefreshResultSchema>;

export const llmModelsChangedSchema = z.strictObject({ provider: providerIdSchema.exactOptional() });
export type LlmModelsChanged = z.infer<typeof llmModelsChangedSchema>;

export const llmDefaultsChangedSchema = z.strictObject({ workspaceId: workspaceIdSchema.exactOptional() });
export type LlmDefaultsChanged = z.infer<typeof llmDefaultsChangedSchema>;

export const providerStatusSchema = z.strictObject({ configured: z.boolean() });
export type ProviderStatus = z.infer<typeof providerStatusSchema>;

// What a provider's `listModels` returns: a model without its provider, plus its id.
export const listedModelSchema = modelDefSchema.omit({ provider: true }).extend({ id: modelIdSchema });
export type ListedModel = z.infer<typeof listedModelSchema>;

// ADR 0153: a provider function runs in its extension's host through these frames. `workspace` and `module`
// repeat the invoke frame's shapes (host-frames.ts), re-declared here so the frame unions import one way only;
// the annotations pin them to the invoke frame's types.
const invocationIdSchema = z.string().min(1);

const provideWorkspaceSchema: z.ZodType<HostWorkspace> = z.strictObject({
  id: workspaceIdSchema,
  path: z.string().min(1),
  name: z.string().min(1),
});

const provideModuleSchema: z.ZodType<NonNullable<InvokeFrame['module']>> = z.strictObject({
  entry: z.string().min(1),
  manifest: manifestSchema,
});

export const provideFrameSchema = z.strictObject({
  frame: z.literal('provide'),
  invocationId: invocationIdSchema,
  extension: z.string().min(1),
  provider: providerIdSchema,
  function: z.enum(['complete', 'status', 'listModels', 'countTokens']),
  input: jsonSchema,
  workspace: provideWorkspaceSchema.nullable(),
  deadlineAt: epochMsSchema,
  correlationId: ulidSchema,
  module: provideModuleSchema.exactOptional(),
});
export type ProvideFrame = z.infer<typeof provideFrameSchema>;

export const providerDeltaFrameSchema = z.strictObject({
  frame: z.literal('provider.delta'),
  invocationId: invocationIdSchema,
  text: z.string().exactOptional(),
  thinking: z.string().exactOptional(),
});
export type ProviderDeltaFrame = z.infer<typeof providerDeltaFrameSchema>;

export const providedFrameSchema = z.strictObject({
  frame: z.literal('provided'),
  invocationId: invocationIdSchema,
  outcome: z.union([
    z.strictObject({ ok: z.literal(true), value: jsonSchema }),
    z.strictObject({ ok: z.literal(false), problem: problemSchema }),
  ]),
});
export type ProvidedFrame = z.infer<typeof providedFrameSchema>;
