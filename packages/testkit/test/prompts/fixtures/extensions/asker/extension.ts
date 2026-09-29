import { defineExtension, z } from '@kvman/sdk';

const questionData = z.object({ topic: z.string().min(1), text: z.string().min(1) });
const toolCallData = z.object({ call: z.string().min(1) });
const closedEntry = z.object({ questionId: z.string(), status: z.enum(['answered', 'rejected', 'expired']) });

// Asker exercises ext.registerPrompt: a question prompt and a tool-call prompt with one open prompt per key (M2.13).
export default defineExtension({
  name: '@acme/asker',
  namespace: 'asker',
  title: '$t.title',
  summary: '$t.summary',
  description: 'Asks the person questions and tool-call reviews for the prompt tests.',
}, (ext) => {
  ext.requestCapability('ui', { reason: 'Asker shows its prompts in the test shell.' });
  const questions = ext.registerPrompt('asker.question', {
    description: 'A question waiting for the person to answer it.',
    data: questionData,
    answer: z.object({ answer: z.string().min(1) }),
    oneOpenPer: (data) => `topic:${data.topic}`,
  });
  const toolCalls = ext.registerPrompt('asker.tool-call', {
    description: 'A tool call waiting for the person to allow or refuse it.',
    data: toolCallData,
    answer: z.object({ allow: z.boolean() }),
    oneOpenPer: (data) => data.call,
  });
  ext.registerCommand('asker.ask', {
    description: 'Asks the person a question and replies with their answer.',
    input: z.object({ topic: z.string().min(1), text: z.string().min(1) }),
    output: z.union([z.object({ answer: z.string() }), z.object({ rejected: z.literal(true) })]),
    handle: async (input, ctx) => questions.open(ctx, input),
  });
  ext.registerCommand('asker.review', {
    description: 'Asks the person to allow a tool call and replies with their decision.',
    input: z.object({ call: z.string().min(1) }),
    output: z.union([z.object({ allow: z.boolean() }), z.object({ rejected: z.literal(true) })]),
    handle: async (input, ctx) => toolCalls.open(ctx, input),
  });
  ext.registerCommand('asker.expire-now', {
    description: 'Expires the open question of one command at once.',
    input: z.object({ commandId: z.string().min(1) }),
    handle: async ({ commandId }, ctx) => {
      ctx.send('asker.question.expire', { commandId, reason: 'cancelled' });
      return {};
    },
  });
  ext.registerCommand('asker.ask-soon', {
    description: 'Asks the person a question whose command ends two seconds later.',
    input: z.object({ topic: z.string().min(1), text: z.string().min(1) }),
    handle: async (input, ctx) => {
      ctx.send('asker.ask', input, { deadlineAt: ctx.now() + 2_000 });
      return {};
    },
  });
  ext.subscribe('asker.question.asked', {
    description: 'Opens a tool-call review from an event when the question is late, which must fail.',
    handle: async (payload, ctx) => {
      const { questionId } = z.object({ questionId: z.string() }).parse(payload);
      const stored = await ctx.store.collection('questions').get(questionId);
      const data = questionData.parse(stored?.data);
      // An event subscription runs outside any command, so this open reaches ctx.defer and fails there.
      if (data.topic === 'late') await toolCalls.open(ctx, { call: questionId });
    },
  });
  ext.registerLog('closed', {
    description: 'Every question close, oldest first.',
    entry: closedEntry,
  });
  ext.subscribe('asker.question.closed', {
    description: 'Logs every question close for the prompt tests.',
    handle: async (payload, ctx) => {
      await ctx.store.log('closed').append(closedEntry.parse(payload));
    },
  });
  ext.registerQuery('asker.state.get', {
    description: 'Answers the logged question closes for the prompt tests.',
    input: z.object({}),
    output: z.object({ closed: z.array(closedEntry) }),
    handle: async (_input, ctx) => ({
      closed: (await ctx.store.log('closed').read()).map((entry) => closedEntry.parse(entry.value)),
    }),
  });
  ext.registerTranslations({
    default: 'en',
    catalogs: {
      en: { title: 'Asker', summary: 'Asks the person questions for the prompt tests.' },
      ar: { title: 'سائل', summary: 'يسأل الشخص أسئلة لاختبارات المطالبات.' },
    },
  });
});
