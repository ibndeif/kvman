import { defineExtension, z } from '@kvman/sdk';

// Asker is a minimal copy of the prompt fixture: only the asker.question prompt and asker.ask (M2.13-E17).
export default defineExtension({
  name: '@acme/asker',
  namespace: 'asker',
  title: '$t.title',
  summary: '$t.summary',
  description: 'Asks the person a question and waits for the answer.',
}, (ext) => {
  const questions = ext.registerPrompt('asker.question', {
    description: 'A question waiting for the person to answer it.',
    data: z.object({ topic: z.string().min(1), text: z.string().min(1) }),
    answer: z.object({ answer: z.string().min(1) }),
    oneOpenPer: (data) => `topic:${data.topic}`,
  });
  ext.registerCommand('asker.ask', {
    description: 'Asks the person a question and replies with their answer.',
    input: z.object({ topic: z.string().min(1), text: z.string().min(1) }),
    output: z.object({ answer: z.string() }),
    handle: async (input, ctx) => questions.open(ctx, input),
  });
  ext.registerTranslations({
    default: 'en',
    catalogs: {
      en: { title: 'Asker', summary: 'Asks the person a question.' },
      ar: { title: 'سائل', summary: 'يسأل الشخص سؤالا.' },
    },
  });
});
