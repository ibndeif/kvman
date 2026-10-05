import type { SimpleStreamOptions } from '@earendil-works/pi-ai';
import type { CompleteInput } from '../schemas/complete.ts';

// The options kvai hands pi-ai (plan 07 §7.1). The job's signal aborts the request, and pi-ai's own retries are off:
// the harness decides (ADR 0009, 59). `sessionId` goes through only when the call names one.

export function streamOptions(signal: AbortSignal, input: CompleteInput, apiKey: string | undefined): SimpleStreamOptions {
  const thinking = input.thinking ?? 'off';
  return {
    ...(apiKey === undefined ? {} : { apiKey }),
    signal,
    maxRetries: 0,
    ...(thinking === 'off' ? {} : { reasoning: thinking }),
    ...(input.maxTokens === undefined ? {} : { maxTokens: input.maxTokens }),
    ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
  };
}
