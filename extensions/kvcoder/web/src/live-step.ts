import type { StreamEvent } from '@kvman/sdk/web';

// What a running step streams (plan 08 §8.7, ADR 0009, 99, 142): kvai's text and thinking deltas build the pending
// answer, and its tool-call chunks give each call's title and description as the model writes them (ADR 144); kvcoder's
// chunks tell the conversation to follow the next step, show a subagent, or that a summary is being made (whose text
// isn't the answer).

/** A tool call being written or run. `carried` marks a call the previous step approved and this one is running. */
export type LiveCall = { name: string; title?: string; description?: string; complete: boolean; carried?: boolean };

export type Live = { text: string; thinking: string; summarizing: boolean; calls: LiveCall[]; startedAt: number };

export type Phase = 'waiting' | 'thinking' | 'writing' | 'preparing' | 'running';

export type StepSignal = { kind: 'follow'; jobId: string } | { kind: 'subagent'; sessionId: string; jobId: string } | { kind: 'question' } | { kind: 'none' };

export const idleLive = (): Live => ({ text: '', thinking: '', summarizing: false, calls: [], startedAt: Date.now() });

function record(data: unknown): Record<string, unknown> | undefined {
  return typeof data === 'object' && data !== null && !Array.isArray(data) ? Object.fromEntries(Object.entries(data)) : undefined;
}

/** What the step is doing now. A call whose arguments are all in is being run; the model comes first otherwise. */
export function phaseOf(live: Live): Phase {
  const last = live.calls.at(-1);
  if (last !== undefined) return last.complete ? 'running' : 'preparing';
  if (live.text !== '') return 'writing';
  return live.thinking === '' ? 'waiting' : 'thinking';
}

// A `toolcall` chunk: without `arguments` a call starts; with them, the last call has those arguments complete, and the
// call is whole once its command is in (the last of the tool's arguments, ADR 0009, 143).
function applyToolCall(live: Live, data: Record<string, unknown>, name: string): void {
  const given = record(data['arguments']);
  if (given === undefined || live.calls.length === 0) live.calls.push({ name, complete: false });
  const call = live.calls.at(-1);
  if (given === undefined || call === undefined) return;
  if (typeof given['title'] === 'string') call.title = given['title'];
  if (typeof given['description'] === 'string') call.description = given['description'];
  call.complete = 'command' in given;
}

/** Applies one stream event to the live answer and says what kvcoder asked for. */
export function applyEvent(live: Live, event: StreamEvent): StepSignal {
  if (event.type !== 'progress') return { kind: 'none' };
  const data = record(event.data);
  if (data === undefined) return { kind: 'none' };
  if (event.source === '@kvman/kvai' && !live.summarizing) {
    if (live.calls.some((call) => call.carried === true)) live.calls = [];
    if (data['type'] === 'text' && typeof data['delta'] === 'string') live.text += data['delta'];
    if (data['type'] === 'thinking' && typeof data['delta'] === 'string') live.thinking += data['delta'];
    if (data['type'] === 'toolcall' && typeof data['name'] === 'string') applyToolCall(live, data, data['name']);
    return { kind: 'none' };
  }
  if (event.source !== '@kvman/kvcoder') return { kind: 'none' };
  if (data['type'] === 'compaction') live.summarizing = data['state'] === 'started';
  if (data['type'] === 'follow' && typeof data['jobId'] === 'string') return { kind: 'follow', jobId: data['jobId'] };
  if (data['type'] === 'subagent' && typeof data['sessionId'] === 'string' && typeof data['jobId'] === 'string') return { kind: 'subagent', sessionId: data['sessionId'], jobId: data['jobId'] };
  if (data['type'] === 'component') return { kind: 'question' };
  return { kind: 'none' };
}
