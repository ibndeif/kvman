import { ProblemError, type Ctx, type InputOf, type OutputOf } from '@kvman/sdk';
import type {} from '@kvman/kvai';
import { delay } from '../delay.ts';

// A step's model call, tried again when it fails for a temporary reason (plan 08 §8.2, ADR 0009, 154, 155, and 203):
// four tries in all, after 1 s, 4 s, and then 15 s. Any other failure, and a stop, end it at once.

const waitsMs = [1_000, 4_000, 15_000] as const;

const transient = (error: ProblemError): boolean => error.problem.code === 'kvai/RATE_LIMITED' || (error.problem.code === 'kvai/PROVIDER_ERROR' && error.problem.params?.['transient'] === true);

export async function completeWithRetries(ctx: Ctx, input: InputOf<'kvai.complete'>): Promise<OutputOf<'kvai.complete'>> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await ctx.exec('kvai.complete', input);
    } catch (error) {
      const wait = waitsMs[attempt - 1];
      if (!(error instanceof ProblemError) || !transient(error) || wait === undefined || ctx.job.signal.aborted) throw error;
      ctx.log.warn('A model call failed for a temporary reason; trying again.', { code: error.problem.code, attempt });
      ctx.job.progress({ type: 'retry', attempt: attempt + 1, of: waitsMs.length + 1 });
      await delay(wait, ctx.job.signal);
      ctx.job.signal.throwIfAborted();
    }
  }
}
