import { isContextOverflow, type Api, type AssistantMessage, type Model } from '@earendil-works/pi-ai';
import type { Ctx, ProblemError } from '@kvman/sdk';

// kvai's failures (plan 07 §7.1, ADR 0009, 63). pi-ai reports a failed request as a message with `stopReason: 'error'`
// and the provider's text; an HTTP 429 reads `429: …`. A `reason` never carries the key.

const rateLimitPattern = /^429\b|rate.?limit|too many requests/i;
const reasonLimit = 1000;

export function redacted(text: string, secretKey: string | undefined): string {
  const hidden = secretKey === undefined || secretKey === '' ? text : text.replaceAll(secretKey, '[secret]');
  return hidden.slice(0, reasonLimit);
}

export function failedCall(ctx: Ctx, fullId: string, message: AssistantMessage, model: Model<Api>, secretKey: string | undefined): ProblemError {
  if (isContextOverflow(message, model.contextWindow)) return ctx.problem('kvai/CONTEXT_TOO_LONG', { model: fullId });
  const reason = message.errorMessage ?? '';
  if (rateLimitPattern.test(reason)) return ctx.problem('kvai/RATE_LIMITED', { model: fullId });
  return ctx.problem('kvai/PROVIDER_ERROR', { model: fullId, reason: redacted(reason, secretKey) });
}
