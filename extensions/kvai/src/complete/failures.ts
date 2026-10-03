import { isContextOverflow, type Api, type AssistantMessage, type Model } from '@earendil-works/pi-ai';
import type { Ctx, ProblemError } from '@kvman/sdk';

// kvai's failures (plan 07 §7.1, ADR 0009, 63). pi-ai reports a failed request as a message with `stopReason: 'error'`
// and the provider's text; an HTTP 429 reads `429: …`. A `reason` never carries the key.

const rateLimitPattern = /^429\b|rate.?limit|too many requests/i;
const reasonLimit = 1000;
// A second try may fix these (ADR 0009, 154 and 203): an HTTP 408, 409, 425, or 5xx (pi-ai's reason starts with the
// status), overloaded or unavailable providers, timeouts, and dropped or refused connections.
const transientPattern = /^(?:408|409|425|5\d\d)\b|timed? ?out|timeout|connection error|econn(?:reset|refused|aborted)|etimedout|enotfound|eai_again|fetch failed|socket hang up|overloaded|service unavailable|bad gateway/i;

/** Whether a provider's failure text is one a second try may fix. */
export const isTransient = (reason: string): boolean => transientPattern.test(reason);

export function redacted(text: string, secrets: readonly string[]): string {
  const hidden = secrets.filter((secret) => secret !== '').reduce((shown, secret) => shown.replaceAll(secret, '[secret]'), text);
  return hidden.slice(0, reasonLimit);
}

export function failedCall(ctx: Ctx, fullId: string, message: AssistantMessage, model: Model<Api>, secrets: readonly string[]): ProblemError {
  if (isContextOverflow(message, model.contextWindow)) return ctx.problem('kvai/CONTEXT_TOO_LONG', { model: fullId });
  const reason = message.errorMessage ?? '';
  if (rateLimitPattern.test(reason)) return ctx.problem('kvai/RATE_LIMITED', { model: fullId });
  return ctx.problem('kvai/PROVIDER_ERROR', { model: fullId, reason: redacted(reason, secrets), transient: isTransient(reason) });
}
