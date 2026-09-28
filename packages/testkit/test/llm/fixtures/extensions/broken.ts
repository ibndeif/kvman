import { defineExtension, llmProblem, z } from '@kvman/sdk';

// Broken fails by its global config mode: plain throws a plain Error, invalid returns a result outside
// llmResultSchema, overflow and unconfigured throw their LLM problems. Its status always throws.
export default defineExtension({
  name: '@acme/broken',
  namespace: 'broken',
  title: 'Broken',
  description: 'A provider that fails by its config mode.',
}, (ext) => {
  ext.registerConfig({
    scope: 'global',
    schema: z.object({
      mode: z.enum(['plain', 'invalid', 'overflow', 'unconfigured']).optional().describe('How complete fails.'),
    }),
  });
  ext.registerProvider('broken', {
    title: 'Broken',
    description: 'Fails by its config mode.',
    auth: 'none',
    status: async () => {
      throw new Error('broken cannot report status');
    },
    complete: async (_request, ctx) => {
      const mode = (await ctx.config.get())['mode'];
      if (mode === 'overflow') throw llmProblem('LLM_CONTEXT_OVERFLOW', 'the request is too large for the model');
      if (mode === 'unconfigured') throw llmProblem('LLM_NOT_CONFIGURED', 'the provider is not configured');
      // The fixture fails the call path on purpose: a negative token count does not match llmResultSchema.
      if (mode === 'invalid') return { content: 'broken', usage: { input: -1, output: 0 }, model: { provider: 'broken', id: 'broken-model' }, stopReason: 'end' };
      ctx.delta({ text: 'partial' });
      throw new Error('broken cannot complete the request');
    },
  });
  ext.registerModel('broken-model', {
    provider: 'broken',
    title: 'Broken Model',
    description: 'A model that always fails.',
    contextWindow: 8000,
    maxOutput: 1000,
    capabilities: { tools: false, vision: false, thinking: [] },
  });
});
