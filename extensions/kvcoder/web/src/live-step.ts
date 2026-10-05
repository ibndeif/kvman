import type { StreamEvent } from '@kvman/sdk/web';
import { callView } from './call-view.ts';

// What a running step streams (plan 08 §8.7, ADR 0009, 99, 142): kvai's text and thinking deltas build the pending
// answer, and its tool-call chunks give each call's description and connector command as the model writes them (ADR 144; ADR 0011, 13); kvcoder's
// chunks tell the conversation to follow the next step, show a subagent, that a summary is being made (whose text
// isn't the answer), or that a failed model call is being tried again (ADR 0009, 155).

/** A tool call being written or run. `carried` marks a call the previous step approved and this one is running. */
export type LiveCall = { name: string; description?: string; label?: string; complete: boolean; carried?: boolean };

export type Live = { text: string; thinking: string; summarizing: boolean; calls: LiveCall[]; retry: { attempt: number; of: number } | null; startedAt: number };

export type Phase = 'waiting' | 'retrying' | 'thinking' | 'writing' | 'preparing' | 'running';

export type StepSignal = { kind: 'follow'; jobId: string } | { kind: 'subagent'; sessionId: string; jobId: string } | { kind: 'question' } | { kind: 'none' };

export const idleLive = (): Live => ({ text: '', thinking: '', summarizing: false, calls: [], retry: null, startedAt: Date.now() });

function record(data: unknown): Record<string, unknown> | undefined {
  return typeof data === 'object' && data !== null && !Array.isArray(data) ? Object.fromEntries(Object.entries(data)) : undefined;
}

/** What the step is doing now. A call whose arguments are all in is being run; the model comes first otherwise. */
export function phaseOf(live: Live): Phase {
  const last = live.calls.at(-1);
  if (last !== undefined) return last.complete ? 'running' : 'preparing';
  if (live.text !== '') return 'writing';
  if (live.thinking !== '') return 'thinking';
  return live.retry === null ? 'waiting' : 'retrying';
}

// A `toolcall` chunk: without `arguments` a call starts; with them, the last call has those arguments complete, and the
// call is whole once its payload is in (the last of the tool's arguments; `null` when it was too large to stream).
function applyToolCall(live: Live, data: Record<string, unknown>, name: string): void {
  const given = record(data['arguments']);
  if (given === undefined || live.calls.length === 0) live.calls.push({ name, complete: false });
  const call = live.calls.at(-1);
  if (given === undefined || call === undefined) return;
  const view = callView(given);
  if (view.description !== undefined) call.description = view.description;
  if (view.label !== undefined) call.label = view.label;
  call.complete = 'payload' in given;
}

/** Applies one stream event to the live answer and says what kvcoder asked for. */
export function applyEvent(live: Live, event: StreamEvent): StepSignal {
  if (event.type !== 'progress') return { kind: 'none' };
  const data = record(event.data);
  if (data === undefined) return { kind: 'none' };
  if (event.source === '@kvman/kvai' && !live.summarizing) {
    live.retry = null;
    if (live.calls.some((call) => call.carried === true)) live.calls = [];
    if (data['type'] === 'text' && typeof data['delta'] === 'string') live.text += data['delta'];
    if (data['type'] === 'thinking' && typeof data['delta'] === 'string') live.thinking += data['delta'];
    if (data['type'] === 'toolcall' && typeof data['name'] === 'string') applyToolCall(live, data, data['name']);
    return { kind: 'none' };
  }
  if (event.source !== '@kvman/kvcoder') return { kind: 'none' };
  if (data['type'] === 'compaction') live.summarizing = data['state'] === 'started';
  if (data['type'] === 'retry' && typeof data['attempt'] === 'number' && typeof data['of'] === 'number') live.retry = { attempt: data['attempt'], of: data['of'] };
  if (data['type'] === 'follow' && typeof data['jobId'] === 'string') return { kind: 'follow', jobId: data['jobId'] };
  if (data['type'] === 'subagent' && typeof data['sessionId'] === 'string' && typeof data['jobId'] === 'string') return { kind: 'subagent', sessionId: data['sessionId'], jobId: data['jobId'] };
  if (data['type'] === 'component') return { kind: 'question' };
  return { kind: 'none' };
}
