import { z, type Ctx } from '@kvman/sdk';
import type { CustomCatalog } from './catalog/custom-catalog.ts';
import { callDelegate } from './complete/delegate-call.ts';
import { callModel } from './complete/model-call.ts';
import { resolveTarget } from './complete/target.ts';
import { completeInputSchema, completeOutputSchema } from './schemas/complete.ts';
import { addUsage } from './usage/usage-totals.ts';

// `kvai.complete` and the `kvai.defaultModel` setting (plan 07 §7.1–§7.2). A retried stream would repeat its deltas,
// so the command never retries, and it takes contexts up to 32 MiB (ADR 0003, 8 and 16).

const maxContextBytes = 32 * 1024 * 1024;

/** A full model id, `<provider>/<model>`. */
export const modelIdSchema = z.string().regex(/^[^/\s]+\/.+$/, 'A model id is "<provider>/<model>".');

export function registerComplete(ctx: Ctx, catalog: CustomCatalog): void {
  ctx.registerSetting('kvai.defaultModel', {
    description: 'The model kvai.complete uses when a call names none.',
    schema: modelIdSchema.nullable(),
    default: null,
  });

  ctx.registerCommand('kvai.complete', {
    description: 'Calls a model with a context and returns its answer, streaming deltas to the root job.',
    input: completeInputSchema,
    output: completeOutputSchema,
    public: true,
    retries: 0,
    maxInputBytes: maxContextBytes,
    handle: async (input) => {
      const fullId = input.model ?? (await ctx.settings.get('kvai.defaultModel'));
      if (fullId === null) throw ctx.problem('kvai/NO_MODEL');
      const target = await resolveTarget(ctx, catalog, fullId);
      const output = target.kind === 'delegate' ? await callDelegate(ctx, fullId, target.command, input) : await callModel(ctx, fullId, target, input);
      await addUsage(ctx, fullId, output.usage);
      return output;
    },
  });
}
