import { defineExtension, z } from '@kvman/sdk';

function codeOf(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'problem' in error) {
    const { problem } = error;
    if (typeof problem === 'object' && problem !== null && 'code' in problem && typeof problem.code === 'string') return problem.code;
  }
  return undefined;
}

// Asks the fake model and answers its content, or the failure's code (M2.13-E34).
export default defineExtension({
  name: '@acme/thinker',
  namespace: 'thinker',
  title: '$t.title',
  summary: '$t.summary',
  description: 'Asks the model and answers what it said.',
}, (ext) => {
  ext.requestCapability('llm', { reason: 'Asks the model for an answer.' });
  ext.registerCommand('thinker.ask', {
    description: 'Asks the fake model and answers its content or failure code.',
    input: z.object({}),
    handle: async (_input, ctx) => {
      try {
        const result = await ctx.llm.complete({
          purpose: 'chat',
          messages: [{ role: 'user', content: 'Say hello.' }],
          model: { provider: 'fake', id: 'fake-model' },
        });
        return { content: result.content };
      } catch (error) {
        const code = codeOf(error);
        if (code === undefined) throw error;
        return { code };
      }
    },
  });
  ext.registerTranslations({
    default: 'en',
    catalogs: {
      en: { title: 'Thinker', summary: 'Asks the model for an answer.' },
      ar: { title: 'مفكر', summary: 'يسأل النموذج عن إجابة.' },
    },
  });
});
