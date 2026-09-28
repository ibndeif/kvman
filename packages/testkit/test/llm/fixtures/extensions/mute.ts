import type { LlmResult } from '@kvman/protocol';
import { defineExtension, z, type Ctx } from '@kvman/sdk';

const askInput = z.object({
  purpose: z.enum(['chat', 'summary', 'extension', 'child']),
  model: z.object({ provider: z.string(), id: z.string() }).optional(),
  thinking: z.enum(['off', 'low', 'medium', 'high']).optional(),
  live: z.object({ text: z.string().optional(), thinking: z.string().optional() }).optional(),
  failOnce: z.boolean().optional(),
});

async function askModel(input: z.output<typeof askInput>, ctx: Ctx): Promise<LlmResult> {
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

// Mute asks like Asker but never requests the llm capability, so every call is refused.
export default defineExtension({
  name: '@acme/mute',
  namespace: 'mute',
  title: 'Mute',
  description: 'Asks models without the llm capability.',
}, (ext) => {
  ext.registerError('mute/AGAIN', { description: 'Fails the first attempt after the call.', title: 'Try again', retryable: true });

  ext.registerEvent('mute.tokens.generated', {
    description: 'Answer text as it is generated.', delivery: 'live', chunk: 'text',
  });
  ext.registerEvent('mute.thinking.generated', {
    description: 'Thinking text as it is generated.', delivery: 'live', chunk: 'text',
  });

  ext.registerCommand('mute.ask', {
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
        if (first) throw ctx.problem('mute/AGAIN');
      }
      return result;
    },
  });
  ext.registerCommand('mute.count', {
    description: 'Counts a request for a model.',
    input: z.object({ model: z.object({ provider: z.string(), id: z.string() }) }),
    output: z.object({ tokens: z.number().int() }),
    handle: async ({ model }, ctx) => ({
      tokens: await ctx.llm.countTokens({
        purpose: 'chat', model, messages: [{ role: 'user', content: 'count these words please' }],
      }),
    }),
  });
  ext.registerCommand('mute.models', {
    description: 'Lists the enabled models.',
    input: z.object({}), output: z.array(z.json()),
    handle: async (_input, ctx) => ctx.llm.models(),
  });
});
