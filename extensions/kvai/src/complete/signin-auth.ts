import { ModelsError } from '@earendil-works/pi-ai';
import { ProblemError, type Ctx } from '@kvman/sdk';
import { isTransient, redacted } from './failures.ts';
import type { Target } from './target.ts';

// A call with a sign-in (plan 07 §7.1, ADR 0009, 235). pi-ai refreshes an expiring token when it resolves the call's
// auth; doing that first, here, gives a refresh that fails its own error code, which the stream would turn into text.

type SigninTarget = Extract<Target, { kind: 'model' }>;

export async function authorizeSignin(ctx: Ctx, fullId: string, target: SigninTarget): Promise<void> {
  try {
    if ((await target.models.getAuth(target.model, { signal: ctx.job.signal })) === undefined) throw ctx.problem('kvai/SIGNIN_EXPIRED', { provider: target.provider });
  } catch (error) {
    ctx.job.signal.throwIfAborted();
    if (error instanceof ProblemError) throw error;
    if (!(error instanceof Error)) throw error;
    if (error instanceof ModelsError && error.cause instanceof ProblemError) throw error.cause;
    if (error instanceof ModelsError && error.code === 'oauth' && !isTransient(error.message)) throw ctx.problem('kvai/SIGNIN_EXPIRED', { provider: target.provider });
    throw ctx.problem('kvai/PROVIDER_ERROR', { model: fullId, reason: redacted(error.message, target.secrets), transient: isTransient(error.message) });
  }
}
