import { failureEnvelopeSchema, jsonSchema, problemSchema, z } from '@kvman/sdk';
import type { StreamEvent } from '@kvman/sdk/web';
import { offlineProblem } from './offline.ts';

// A job's stream (plan 04 §4.4) read with `fetch`: Server-Sent Events whose `data` is JSON — `progress` chunks, then one
// `result` or `problem`. An unknown job answers with the failure envelope instead, and a connection that drops before
// the end counts as kvman not answering.

const progressSchema = z.object({ source: z.string(), data: jsonSchema });

function eventOf(frame: string): StreamEvent | undefined {
  const lines = frame.split('\n');
  const field = (name: string) => lines.filter((line) => line.startsWith(`${name}:`)).map((line) => line.slice(name.length + 1).replace(/^ /, ''));
  const data: unknown = JSON.parse(field('data').join('\n'));
  const event = field('event')[0];
  if (event === 'progress') return { type: 'progress', ...progressSchema.parse(data) };
  if (event === 'result') return { type: 'result', output: jsonSchema.parse(data) };
  if (event === 'problem') return { type: 'problem', problem: problemSchema.parse(data) };
  return undefined;
}

async function refusal(response: Response): Promise<StreamEvent> {
  const envelope = failureEnvelopeSchema.safeParse(await response.json().catch(() => undefined));
  return { type: 'problem', problem: envelope.success ? envelope.data.problem : offlineProblem };
}

export async function* streamEvents(fetcher: typeof fetch, jobId: string, signal: AbortSignal): AsyncGenerator<StreamEvent> {
  const response = await fetcher(`/api/jobs/${encodeURIComponent(jobId)}/stream`, { signal }).catch(() => undefined);
  if (signal.aborted) return;
  if (response === undefined || response.body === null) {
    yield { type: 'problem', problem: offlineProblem };
    return;
  }
  if (!(response.headers.get('content-type') ?? '').startsWith('text/event-stream')) {
    yield await refusal(response);
    return;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const read = await reader.read().catch(() => undefined);
      if (signal.aborted) return;
      if (read === undefined || read.done) {
        yield { type: 'problem', problem: offlineProblem };
        return;
      }
      buffer += decoder.decode(read.value, { stream: true }).replaceAll('\r\n', '\n');
      for (let end = buffer.indexOf('\n\n'); end >= 0; end = buffer.indexOf('\n\n')) {
        const event = eventOf(buffer.slice(0, end));
        buffer = buffer.slice(end + 2);
        if (event !== undefined) yield event;
        if (event !== undefined && event.type !== 'progress') return;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
