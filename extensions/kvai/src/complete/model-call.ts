import type { Ctx } from '@kvman/sdk';
import { assistantMessageSchema } from '../schemas/messages.ts';
import type { CompleteInput, CompleteOutput } from '../schemas/complete.ts';
import { createDeltaReader } from './deltas.ts';
import { failedCall } from './failures.ts';
import { silenceMeter } from './silences.ts';
import { streamOptions } from './stream-options.ts';
import { authorizeSignin } from './signin-auth.ts';
import { readOauthCredential, tokensOf } from '../signin/credential-store.ts';
import type { Target } from './target.ts';

// One call through pi-ai (plan 07 §7.1). Deltas go to the root job's stream as they arrive; tool calls are returned,
// never run. The job's signal aborts the request, and pi-ai's own retries are off: the harness decides (ADR 0009, 59).
// Each call logs how long its stream was silent (ADR 0094, 2).

export async function callModel(ctx: Ctx, fullId: string, target: Extract<Target, { kind: 'model' }>, input: CompleteInput): Promise<CompleteOutput> {
  const context = {
    ...(input.systemPrompt === undefined ? {} : { systemPrompt: input.systemPrompt }),
    messages: input.messages,
    ...(input.tools === undefined ? {} : { tools: input.tools }),
  };
  if (target.signedIn) await authorizeSignin(ctx, fullId, target);
  const events = target.models.streamSimple(target.model, context, streamOptions(ctx.job.signal, input, target.apiKey));
  const deltaOf = createDeltaReader();
  const meter = silenceMeter();
  try {
    for await (const event of events) {
      meter.mark();
      const delta = deltaOf(event);
      if (delta !== undefined) ctx.job.progress(delta);
    }
  } finally {
    // Numbers only: never a payload (ADR 0094, 2).
    ctx.log.info('A model call ended its stream.', { model: fullId, ...meter.silences() });
  }
  const message = await events.result();
  if (message.stopReason === 'aborted') ctx.job.signal.throwIfAborted();
  if (message.stopReason !== 'stop' && message.stopReason !== 'length' && message.stopReason !== 'toolUse') {
    throw failedCall(ctx, fullId, message, target.model, [...target.secrets, ...tokensOf(await readOauthCredential(ctx, target.provider))]);
  }
  const answer = assistantMessageSchema.parse(message);
  const { usage } = answer;
  return {
    message: answer,
    stopReason: answer.stopReason,
    usage: { input: usage.input, output: usage.output, cacheRead: usage.cacheRead, cacheWrite: usage.cacheWrite, cost: usage.cost.total },
  };
}
