import { isContextOverflow, type Api, type AssistantMessage, type Model } from '@earendil-works/pi-ai';
import type { Ctx, ProblemError } from '@kvman/sdk';
import { isTransient } from './transient.ts';

// kvai's failures (plan 07 §7.1, ADR 0009, 63). pi-ai reports a failed request as a message with `stopReason: 'error'`
// and the provider's text; an HTTP 429 reads `429: …`. A `reason` never carries the key.

const rateLimitPattern = /^429\b|rate.?limit|too many requests/i;
// An account out of usage or quota, and a request the provider declined for its content (ADR 0050, 2): a second try
// fixes neither. A quota failure often comes as a 429, so it is checked before the rate limit.
const usageLimitPattern = /usage limit|insufficient_quota|exceeded your current quota/i;
const refusedPattern = /flagged for|content[ _-]?(?:policy|filter)|safety system/i;
const reasonLimit = 1000;

export function redacted(text: string, secrets: readonly string[]): string {
  const hidden = secrets.filter((secret) => secret !== '').reduce((shown, secret) => shown.replaceAll(secret, '[secret]'), text);
  return hidden.slice(0, reasonLimit);
}

export function failedCall(ctx: Ctx, fullId: string, message: AssistantMessage, model: Model<Api>, secrets: readonly string[]): ProblemError {
  if (isContextOverflow(message, model.contextWindow)) return ctx.problem('kvai/CONTEXT_TOO_LONG', { model: fullId });
  const reason = message.errorMessage ?? '';
  if (usageLimitPattern.test(reason)) return ctx.problem('kvai/USAGE_LIMIT', { model: fullId });
  if (rateLimitPattern.test(reason)) return ctx.problem('kvai/RATE_LIMITED', { model: fullId });
  if (refusedPattern.test(reason)) return ctx.problem('kvai/REFUSED', { model: fullId });
  return ctx.problem('kvai/PROVIDER_ERROR', { model: fullId, reason: redacted(reason, secrets), transient: isTransient(reason) });
}
