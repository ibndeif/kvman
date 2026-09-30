import { z } from '@kvman/sdk';

// Providers and models (plan 07 §7.2, ADR 0009, 52–57): the admin API's shapes and the documents kept in kvai's
// global store. A full model id is `<provider>/<model>`; provider ids never contain `/`.

/** The wire APIs a custom provider may speak: the ones that need only a base URL and a key (ADR 0009, 56). */
export const customApis = ['openai-completions', 'openai-responses', 'anthropic-messages', 'google-generative-ai', 'mistral-conversations'] as const;

export type CustomApi = (typeof customApis)[number];

const providerIdSchema = z.string().regex(/^[^/\s]+$/, 'A provider id is non-empty and has no "/" or spaces.');

const costSchema = z.object({
  input: z.number().nonnegative(),
  output: z.number().nonnegative(),
  cacheRead: z.number().nonnegative(),
  cacheWrite: z.number().nonnegative(),
});

const inputKindsSchema = z.array(z.enum(['text', 'image'])).min(1);

/** A custom provider that pi-ai calls over one of its wire APIs. */
const apiProviderSchema = z.strictObject({
  id: providerIdSchema,
  title: z.string().min(1),
  api: z.enum(customApis),
  baseUrl: z.url({ protocol: /^https?$/ }),
  headers: z.record(z.string(), z.string()).exactOptional(),
  compat: z.record(z.string(), z.json()).exactOptional(),
});

/** A custom provider whose calls kvai forwards to a public command. */
const delegateProviderSchema = z.strictObject({ id: providerIdSchema, title: z.string().min(1), delegate: z.string().min(1) });

/** `kvai.provider.add`'s input: one of the two forms. */
export const providerAddSchema = z.union([apiProviderSchema, delegateProviderSchema]);

export type ProviderAdd = z.output<typeof providerAddSchema>;

const storedApiProviderSchema = z.object({
  providerId: z.string(),
  title: z.string(),
  api: z.enum(customApis),
  baseUrl: z.string(),
  headers: z.record(z.string(), z.string()).exactOptional(),
  compat: z.record(z.string(), z.json()).exactOptional(),
});

const storedDelegateProviderSchema = z.object({ providerId: z.string(), title: z.string(), delegate: z.string() });

/** A custom provider as kvai keeps it. */
export const storedProviderSchema = z.union([storedApiProviderSchema, storedDelegateProviderSchema]);

export type StoredProvider = z.output<typeof storedProviderSchema>;

/** A custom provider that pi-ai calls over a wire API. */
export type ApiProvider = z.output<typeof storedApiProviderSchema>;

/** `kvai.model.add`'s input; `id` is the model's own id under `provider` (ADR 0009, 54). */
export const modelAddSchema = z.object({
  provider: providerIdSchema,
  id: z.string().min(1),
  name: z.string().min(1),
  reasoning: z.boolean(),
  input: inputKindsSchema,
  contextWindow: z.number().int().positive(),
  maxTokens: z.number().int().positive(),
  cost: costSchema.exactOptional(),
});

/** A custom model as kvai keeps it. */
export const storedModelSchema = z.object({
  provider: z.string(),
  modelId: z.string(),
  name: z.string(),
  reasoning: z.boolean(),
  input: inputKindsSchema,
  contextWindow: z.number(),
  maxTokens: z.number(),
  cost: costSchema,
});

export type StoredModel = z.output<typeof storedModelSchema>;

/** Whether a provider can be called: its key is set, a built-in lacks one, or a custom one works without it (ADR 0009, 79). */
export const providerStatusSchema = z.enum(['ready', 'needsKey', 'noKey']);

export type ProviderStatus = z.output<typeof providerStatusSchema>;

/** A row of `kvai.provider.list` and `kvai.provider.get`; `models` is its model count. */
export const providerRowSchema = z.object({ id: z.string(), title: z.string(), builtIn: z.boolean(), status: providerStatusSchema, models: z.number().int() });

export type ProviderRow = z.output<typeof providerRowSchema>;

/** The input of `kvai.provider.key.set`: the key is write-only, so kvwebui shows a password field for it. */
export const providerKeySetSchema = z.object({ provider: z.string().min(1), key: z.string().min(1).meta({ writeOnly: true }) });

/** The answer of `kvai.model.default.get`. */
export const defaultModelSchema = z.object({ id: z.string().nullable(), name: z.string().nullable(), ready: z.boolean() });

/** A row of `kvai.model.list`; `id` is the full `<provider>/<model>`. */
export const modelRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  provider: z.string(),
  reasoning: z.boolean(),
  input: z.array(z.enum(['text', 'image'])),
  contextWindow: z.number(),
  maxTokens: z.number(),
  cost: costSchema,
  builtIn: z.boolean(),
  isDefault: z.boolean(),
});

export type ModelRow = z.output<typeof modelRowSchema>;

/** Splits a full model id at its first `/`, or gives `undefined` when it has none. */
export function splitModelId(fullId: string): { provider: string; model: string } | undefined {
  const slash = fullId.indexOf('/');
  if (slash <= 0 || slash === fullId.length - 1) return undefined;
  return { provider: fullId.slice(0, slash), model: fullId.slice(slash + 1) };
}
