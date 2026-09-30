import { ProblemError, type Ctx } from '@kvman/sdk';
import { completeOutputSchema, type CompleteInput, type CompleteOutput } from '../schemas/complete.ts';

// A delegate provider's call (plan 07 §7.2, ADR 0009, 57): kvai forwards `kvai.complete`'s input, with the resolved
// model id, to the provider's public command, which may stream the same deltas. Any failure of that call, including a
// missing or private command, fails `kvai/PROVIDER_ERROR` naming its code.

export async function callDelegate(ctx: Ctx, fullId: string, command: string, input: CompleteInput): Promise<CompleteOutput> {
  let output: unknown;
  try {
    output = await ctx.exec(command, { ...input, model: fullId });
  } catch (error) {
    if (!(error instanceof ProblemError) || ctx.job.signal.aborted) throw error;
    throw ctx.problem('kvai/PROVIDER_ERROR', { model: fullId, cause: error.problem.code });
  }
  const parsed = completeOutputSchema.safeParse(output);
  if (!parsed.success) throw ctx.problem('kvai/PROVIDER_ERROR', { model: fullId, cause: 'VALIDATION_FAILED' });
  return parsed.data;
}
