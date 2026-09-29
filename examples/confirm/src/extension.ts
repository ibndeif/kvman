import { defineExtension, z } from '@kvman/sdk';

export default defineExtension({
  name: '@kvman/example-confirm',
  namespace: 'confirm',
  title: '$t.title',
  summary: '$t.summary',
  description: 'Asks the person to approve an action and waits for the answer.',
}, (ext) => {
  // Registers the collection `requests`, the query `confirm.requests.list`, the commands `confirm.request.answer`
  // and `confirm.request.reject` (people only) and `confirm.request.expire`, and the events `confirm.request.asked`
  // and `confirm.request.closed`.
  const requests = ext.registerPrompt('confirm.request', {
    description: 'An action waiting for the person to approve or refuse it.',
    data: z.object({ topic: z.string().min(1), question: z.string().min(1) }),
    answer: z.object({ approved: z.boolean() }),
    oneOpenPer: (request) => `topic:${request.topic}`,
  });

  ext.registerCommand('confirm.ask', {
    description: 'Asks the person to approve an action and replies with their answer.',
    input: z.object({ topic: z.string().min(1), question: z.string().min(1) }),
    output: z.union([z.object({ approved: z.boolean() }), z.object({ rejected: z.literal(true) })]),
    handle: async (input, ctx) => requests.open(ctx, input),
  });

  ext.registerTranslations({
    default: 'en',
    catalogs: {
      en: { title: 'Confirm', summary: 'Asks you before an action runs.' },
      ar: { title: 'تأكيد', summary: 'يسألك قبل تنفيذ أي إجراء.' },
    },
  });
});
