import type { StreamEvent } from '@kvman/sdk/web';

// What a running step streams (plan 08 §8.7, ADR 0009, 99): kvai's text and thinking deltas build the pending answer;
// kvcoder's chunks tell the conversation to follow the next step, show a subagent, or that a summary is being made
// (whose text isn't the answer).

export type Live = { text: string; thinking: string; summarizing: boolean; tool: string | null };

export type StepSignal = { kind: 'follow'; jobId: string } | { kind: 'subagent'; sessionId: string; jobId: string } | { kind: 'question' } | { kind: 'none' };

export const idleLive = (): Live => ({ text: '', thinking: '', summarizing: false, tool: null });

function record(data: unknown): Record<string, unknown> | undefined {
  return typeof data === 'object' && data !== null && !Array.isArray(data) ? Object.fromEntries(Object.entries(data)) : undefined;
}

/** Applies one stream event to the live answer and says what kvcoder asked for. */
export function applyEvent(live: Live, event: StreamEvent): StepSignal {
  if (event.type !== 'progress') return { kind: 'none' };
  const data = record(event.data);
  if (data === undefined) return { kind: 'none' };
  if (event.source === '@kvman/kvai' && !live.summarizing) {
    if (data['type'] === 'text' && typeof data['delta'] === 'string') live.text += data['delta'];
    if (data['type'] === 'thinking' && typeof data['delta'] === 'string') live.thinking += data['delta'];
    if (data['type'] === 'toolcall' && typeof data['name'] === 'string') live.tool = data['name'];
    return { kind: 'none' };
  }
  if (event.source !== '@kvman/kvcoder') return { kind: 'none' };
  if (data['type'] === 'compaction') live.summarizing = data['state'] === 'started';
  if (data['type'] === 'follow' && typeof data['jobId'] === 'string') return { kind: 'follow', jobId: data['jobId'] };
  if (data['type'] === 'subagent' && typeof data['sessionId'] === 'string' && typeof data['jobId'] === 'string') return { kind: 'subagent', sessionId: data['sessionId'], jobId: data['jobId'] };
  if (data['type'] === 'component') return { kind: 'question' };
  return { kind: 'none' };
}
