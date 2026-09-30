import type { Json, Problem } from '@kvman/sdk';

// Jobs of the fake API: each has an id (UUIDv7-shaped, in the order made), the effects its handlers added, and, for a
// job with a stream, the frames a test sends to every open connection (plan 04 §4.4). A connection made after the end
// gets the end at once, as the kernel's does.

export type FakeJob = {
  id: string;
  addEffect(effect: Json): void;
  progress(source: string, data: Json): void;
  end(output: Json): void;
  fail(problem: Problem): void;
  // How many stream requests it got, and how many of them the client aborted.
  connections: number;
  aborts: number;
};

export type FakeJobs = {
  create(): FakeJob;
  get(id: string): FakeJob | undefined;
  effects: Map<string, Json[]>;
  stream(id: string, signal: AbortSignal | undefined): Response | undefined;
};

const encoder = new TextEncoder();
const frame = (event: string, data: Json | Problem): Uint8Array => encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

export function createFakeJobs(): FakeJobs {
  const jobs = new Map<string, FakeJob & { open: Set<ReadableStreamDefaultController<Uint8Array>>; last?: Uint8Array }>();
  const effects = new Map<string, Json[]>();
  let made = 0;
  const create = (): FakeJob => {
    made += 1;
    const id = `01900000-0000-7000-8000-${String(made).padStart(12, '0')}`;
    const open = new Set<ReadableStreamDefaultController<Uint8Array>>();
    const finish = (bytes: Uint8Array): void => {
      job.last = bytes;
      for (const controller of open) {
        controller.enqueue(bytes);
        controller.close();
      }
      open.clear();
    };
    const job: FakeJob & { open: typeof open; last?: Uint8Array } = {
      id,
      open,
      addEffect: (effect) => effects.set(id, [...(effects.get(id) ?? []), effect]),
      progress: (source, data) => {
        for (const controller of open) controller.enqueue(frame('progress', { source, data }));
      },
      end: (output) => finish(frame('result', output)),
      fail: (problem) => finish(frame('problem', problem)),
      connections: 0,
      aborts: 0,
    };
    jobs.set(id, job);
    return job;
  };
  const stream = (id: string, signal: AbortSignal | undefined): Response | undefined => {
    const job = jobs.get(id);
    if (job === undefined) return undefined;
    job.connections += 1;
    const body = new ReadableStream<Uint8Array>({
      start: (controller) => {
        if (job.last !== undefined) {
          controller.enqueue(job.last);
          controller.close();
          return;
        }
        job.open.add(controller);
        signal?.addEventListener('abort', () => {
          job.aborts += 1;
          job.open.delete(controller);
          controller.error(new DOMException('The operation was aborted.', 'AbortError'));
        });
      },
    });
    return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
  };
  return { create, get: (id) => jobs.get(id), effects, stream };
}
