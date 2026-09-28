import { defineExtension, z } from '@kvman/sdk';

// Lister serves provider lister from its global config: listModels returns the configured entries, countTokens
// answers 42, and complete answers a fixed result. It registers one static model, lister-static.
export default defineExtension({
  name: '@acme/lister-llm',
  namespace: 'lister',
  title: 'Lister',
  description: 'Lists models from its config.',
}, (ext) => {
  ext.registerConfig({
    scope: 'global',
    schema: z.object({
      listed: z.array(z.object({
        id: z.string().describe('The listed model id.'),
        title: z.string().describe('The listed model title.'),
      }).describe('A model listModels returns.')).optional().describe('The models listModels returns.'),
      failList: z.boolean().optional().describe('Makes listModels throw when set.'),
    }),
  });
  ext.registerProvider('lister', {
    title: 'Lister',
    description: 'Lists models from its config.',
    auth: 'none',
    status: async () => ({ configured: true }),
    listModels: async (ctx) => {
      const config = await ctx.config.get();
      if (config['failList'] === true) throw new Error('lister cannot list models');
      const listed = config['listed'];
      if (!Array.isArray(listed)) return [];
      return listed.flatMap((entry: unknown) => {
        if (typeof entry !== 'object' || entry === null) return [];
        const { id, title } = entry as { id: unknown; title: unknown };
        if (typeof id !== 'string' || typeof title !== 'string') return [];
        return [{
          id, title, description: title, contextWindow: 8000, maxOutput: 1000,
          capabilities: { tools: false, vision: false, thinking: [] },
        }];
      });
    },
    countTokens: async () => 42,
    complete: async () => ({
      content: 'lister',
      usage: { input: 1, output: 1 },
      model: { provider: 'lister', id: 'lister-static' },
      stopReason: 'end',
    }),
  });
  ext.registerModel('lister-static', {
    provider: 'lister',
    title: 'Lister Static',
    description: 'A static lister model.',
    contextWindow: 8000,
    maxOutput: 1000,
    capabilities: { tools: false, vision: false, thinking: [] },
  });
});
