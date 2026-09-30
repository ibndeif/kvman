import type { z } from '@kvman/sdk';
import type { defaultModelSchema, modelAddSchema, modelRowSchema, providerAddSchema, providerKeySetSchema, providerRowSchema } from './schemas/catalog.ts';
import type { completeInputSchema, completeOutputSchema } from './schemas/complete.ts';
import type { usageRowSchema, usageTotalSchema } from './usage/usage-totals.ts';

// kvai's public names for typed calls (plan 03 §3.2): a caller gets them after `import type {} from '@kvman/kvai'`.

type Call<Input extends z.ZodType, Output extends z.ZodType> = { input: z.input<Input>; output: z.output<Output> };

type Empty = z.ZodObject<Record<string, never>>;

declare module '@kvman/sdk' {
  interface Commands {
    'kvai.complete': Call<typeof completeInputSchema, typeof completeOutputSchema>;
    'kvai.provider.add': Call<typeof providerAddSchema, Empty>;
    'kvai.provider.remove': { input: { id: string }; output: Record<string, never> };
    'kvai.provider.key.set': Call<typeof providerKeySetSchema, Empty>;
    'kvai.provider.key.delete': { input: { provider: string }; output: Record<string, never> };
    'kvai.model.add': Call<typeof modelAddSchema, Empty>;
    'kvai.model.remove': { input: { id: string }; output: Record<string, never> };
  }
  interface Queries {
    'kvai.provider.list': { input: Record<string, never>; output: z.output<typeof providerRowSchema>[] };
    'kvai.provider.get': { input: { id: string }; output: z.output<typeof providerRowSchema> };
    'kvai.model.list': { input: { provider?: string }; output: z.output<typeof modelRowSchema>[] };
    'kvai.model.default.get': { input: Record<string, never>; output: z.output<typeof defaultModelSchema> };
    'kvai.usage.get': { input: Record<string, never>; output: z.output<typeof usageRowSchema>[] };
    'kvai.usage.total.get': { input: Record<string, never>; output: z.output<typeof usageTotalSchema> };
  }
  interface Settings {
    'kvai.defaultModel': string | null;
  }
}

/** `kvai.complete`'s input. */
export type CompleteInput = z.input<typeof completeInputSchema>;

/** `kvai.complete`'s output: the answer, how it ended, and the call's usage. */
export type CompleteOutput = z.output<typeof completeOutputSchema>;

/** A message of a model's context: pi-ai's user, assistant, or toolResult message. */
export type Message = CompleteInput['messages'][number];

/** The assistant message `kvai.complete` returns. */
export type AssistantMessage = CompleteOutput['message'];

/** A delta kvai streams to the root job as `{ source: '@kvman/kvai', data }`. */
export type { Delta } from './schemas/complete.ts';
