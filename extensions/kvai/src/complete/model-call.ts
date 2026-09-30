import type { AssistantMessageEvent, SimpleStreamOptions } from '@earendil-works/pi-ai';
import type { Ctx } from '@kvman/sdk';
import { assistantMessageSchema } from '../schemas/messages.ts';
import type { CompleteInput, CompleteOutput, Delta } from '../schemas/complete.ts';
import { failedCall } from './failures.ts';
import type { Target } from './target.ts';

// One call through pi-ai (plan 07 §7.1). Deltas go to the root job's stream as they arrive; tool calls are returned,
// never run. The job's signal aborts the request, and pi-ai's own retries are off: the harness decides (ADR 0009, 59).

function deltaOf(event: AssistantMessageEvent): Delta | undefined {
  if (event.type === 'text_delta') return { type: 'text', delta: event.delta };
  if (event.type === 'thinking_delta') return { type: 'thinking', delta: event.delta };
  if (event.type !== 'toolcall_start') return undefined;
  const block = event.partial.content[event.contentIndex];
  return block?.type === 'toolCall' ? { type: 'toolcall', name: block.name } : undefined;
}

function streamOptions(ctx: Ctx, input: CompleteInput, apiKey: string): SimpleStreamOptions {
  const thinking = input.thinking ?? 'off';
  return {
    apiKey,
    signal: ctx.job.signal,
    maxRetries: 0,
    ...(thinking === 'off' ? {} : { reasoning: thinking }),
    ...(input.maxTokens === undefined ? {} : { maxTokens: input.maxTokens }),
  };
}

export async function callModel(ctx: Ctx, fullId: string, target: Extract<Target, { kind: 'model' }>, input: CompleteInput): Promise<CompleteOutput> {
  const context = {
    ...(input.systemPrompt === undefined ? {} : { systemPrompt: input.systemPrompt }),
    messages: input.messages,
    ...(input.tools === undefined ? {} : { tools: input.tools }),
  };
  const events = target.models.streamSimple(target.model, context, streamOptions(ctx, input, target.apiKey));
  for await (const event of events) {
    const delta = deltaOf(event);
    if (delta !== undefined) ctx.job.progress(delta);
  }
  const message = await events.result();
  if (message.stopReason === 'aborted') ctx.job.signal.throwIfAborted();
  if (message.stopReason !== 'stop' && message.stopReason !== 'length' && message.stopReason !== 'toolUse') {
    throw failedCall(ctx, fullId, message, target.model, target.secretKey);
  }
  const answer = assistantMessageSchema.parse(message);
  const { usage } = answer;
  return {
    message: answer,
    stopReason: answer.stopReason,
    usage: { input: usage.input, output: usage.output, cacheRead: usage.cacheRead, cacheWrite: usage.cacheWrite, cost: usage.cost.total },
  };
}
