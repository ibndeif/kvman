import { defineExtension, llmProblem, type ExtensionDefinition } from '@kvman/sdk';

/** Options of the testkit's fake LLM provider (ADR 0154). */
export type FakeProviderOptions = {
  reply?: string;
  thinking?: string;
  chunks?: string[];
  failures?: number;
  retryAfterMs?: number;
  usage?: { input: number; output: number; cacheRead?: number; cacheWrite?: number };
  costUsd?: number;
};

/** The fake LLM provider's extension, built from its options; the testkit loads it in a host from a generated entry (ADR 0165). */
export function fakeProviderExtension(options: FakeProviderOptions = {}): ExtensionDefinition {
  let failed = 0;
  const failures = options.failures ?? 0;
  return defineExtension(
    { name: '@kvman/fake-provider', namespace: 'fake', title: 'Fake provider', description: 'A scripted LLM provider for tests.' },
    (ext) => {
      ext.registerProvider('fake', {
        title: 'Fake',
        description: 'Scripted answers for tests.',
        auth: 'none',
        status: async () => ({ configured: true }),
        complete: async (request, ctx) => {
          if (failed < failures) {
            failed += 1;
            throw llmProblem(
              'LLM_CALL_FAILED',
              'the fake provider fails on purpose',
              options.retryAfterMs === undefined ? {} : { retryAfterMs: options.retryAfterMs },
            );
          }
          for (const text of options.chunks ?? [options.reply ?? 'ok']) ctx.delta({ text });
          if (options.thinking !== undefined) ctx.delta({ thinking: options.thinking });
          return {
            content: options.reply ?? 'ok',
            ...(options.thinking === undefined ? {} : { thinking: options.thinking }),
            usage: options.usage ?? { input: 10, output: 5 },
            ...(options.costUsd === undefined ? {} : { costUsd: options.costUsd }),
            model: request.model ?? { provider: 'fake', id: 'fake-model' },
            stopReason: 'end',
          };
        },
      });
      ext.registerModel('fake-model', {
        provider: 'fake',
        title: 'Fake model',
        description: "The fake provider's only model.",
        contextWindow: 100_000,
        maxOutput: 10_000,
        cost: { inputPerMTok: 1, outputPerMTok: 2 },
        capabilities: { tools: true, vision: true, thinking: ['low', 'medium', 'high'] },
      });
    },
  );
}
