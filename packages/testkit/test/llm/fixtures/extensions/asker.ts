import type { LlmResult } from '@kvman/protocol';
import { defineExtension, z, type Ctx } from '@kvman/sdk';

const askGlobalInput = z.object({
  purpose: z.enum(['chat', 'summary', 'extension', 'child']),
  model: z.object({ provider: z.string(), id: z.string() }).optional(),
  thinking: z.enum(['off', 'low', 'medium', 'high']).optional(),
  live: z.object({ text: z.string().optional(), thinking: z.string().optional() }).optional(),
});

const askInput = askGlobalInput.extend({ failOnce: z.boolean().optional() });

type AskInput = z.output<typeof askGlobalInput>;

async function askModel(input: AskInput, ctx: Ctx): Promise<LlmResult> {
  return ctx.llm.complete({
    purpose: input.purpose,
    messages: [{ role: 'user', content: 'hi' }],
    ...(input.model === undefined ? {} : { model: input.model }),
    ...(input.thinking === undefined ? {} : { thinking: input.thinking }),
    ...(input.live === undefined ? {} : {
      live: {
        ...(input.live.text === undefined ? {} : { text: input.live.text }),
        ...(input.live.thinking === undefined ? {} : { thinking: input.live.thinking }),
      },
    }),
  });
}

// Asker calls models through ctx.llm; with failOnce its first attempt throws a retryable error after the call.
export default defineExtension({
  name: '@acme/asker',
  namespace: 'asker',
  title: 'Asker',
  description: 'Asks models through ctx.llm.',
}, (ext) => {
  ext.requestCapability('llm', { reason: 'Asks models through ctx.llm.' });
  ext.registerError('asker/AGAIN', { description: 'Fails the first attempt after the call.', title: 'Try again', retryable: true });

  ext.registerEvent('asker.tokens.generated', {
    description: 'Answer text as it is generated.', delivery: 'live', chunk: 'text',
  });
  ext.registerEvent('asker.thinking.generated', {
    description: 'Thinking text as it is generated.', delivery: 'live', chunk: 'text',
  });
  ext.registerEvent('asker.progress.updated', {
    description: 'Progress that is not text.', delivery: 'live', chunk: 'value',
  });

  ext.registerCommand('asker.ask', {
    description: 'Asks the resolved model and returns its result.',
    input: askInput,
    handle: async (input, ctx) => {
      const result = await askModel(input, ctx);
      if (input.failOnce === true) {
        let first = false;
        await ctx.step('fail-once', async () => {
          first = true;
          return null;
        });
        if (first) throw ctx.problem('asker/AGAIN');
      }
      return result;
    },
  });
  ext.registerCommand('asker.ask-global', {
    description: 'Asks the resolved model without a workspace.',
    scope: 'global', input: askGlobalInput,
    handle: async (input, ctx) => askModel(input, ctx),
  });
  ext.registerCommand('asker.count', {
    description: 'Counts a request for a model.',
    input: z.object({ model: z.object({ provider: z.string(), id: z.string() }) }),
    output: z.object({ tokens: z.number().int() }),
    handle: async ({ model }, ctx) => ({
      tokens: await ctx.llm.countTokens({
        purpose: 'chat', model, messages: [{ role: 'user', content: 'count these words please' }],
      }),
    }),
  });
  ext.registerCommand('asker.models', {
    description: 'Lists the enabled models.',
    input: z.object({}), output: z.array(z.json()),
    handle: async (_input, ctx) => ctx.llm.models(),
  });
});
