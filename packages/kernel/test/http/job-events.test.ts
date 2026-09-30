import { describe, expect, it } from 'vitest';
import type { Job } from '@kvman/sdk';
import type { ProgressChunk } from '../../src/jobs/progress-hub.ts';
import { jobEvents, type JobEvent, type JobEventSource } from '../../src/http/job-events.ts';

// A job's progress and end, driven by the test.
function fakeJob() {
  const listeners = new Set<(chunk: ProgressChunk) => void>();
  let end: (job: Job) => void = () => undefined;
  const ended = new Promise<Job>((resolve) => {
    end = resolve;
  });
  const source: JobEventSource = {
    watchProgress: (_jobId, listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    waitForJob: () => ended,
  };
  const job = (status: Job['status'], extra: Partial<Job> = {}): Job => ({
    id: '01a0f252-aca3-7143-94ee-f3004a1816bf', name: 'x.run', input: {}, workspaceId: 'home', caller: { kind: 'user' },
    status, attempts: 1, retries: 3, createdAt: '2026-09-30T00:00:00.000Z', ...extra,
  });
  return { source, send: (data: number) => listeners.forEach((listener) => listener({ source: '@test/x', data })), end, job, watching: () => listeners.size };
}

async function collect(events: AsyncGenerator<JobEvent>, during: () => void): Promise<JobEvent[]> {
  const seen: JobEvent[] = [];
  const reading = (async () => {
    for await (const event of events) seen.push(event);
  })();
  await Promise.resolve();
  during();
  await reading;
  return seen;
}

describe('the job stream (04 §4.4, ADR 0009, 42)', () => {
  it('M1.7-E13 only chunks after the client connects, then the result', async () => {
    const fake = fakeJob();
    fake.send(0);
    const seen = await collect(jobEvents(fake.source, 'id', new AbortController().signal), () => {
      fake.send(1);
      fake.send(2);
      fake.end(fake.job('succeeded', { output: { done: true } }));
    });
    expect(seen).toEqual([
      { event: 'progress', data: { source: '@test/x', data: 1 } },
      { event: 'progress', data: { source: '@test/x', data: 2 } },
      { event: 'result', data: { done: true } },
    ]);
    expect(fake.watching()).toBe(0);
  });

  it('M1.7-E14 a failed job ends with its Problem, a cancelled one with CANCELLED', async () => {
    const failed = fakeJob();
    const problem = { code: 'x/BROKEN', message: 'x/BROKEN' };
    expect(await collect(jobEvents(failed.source, 'id', new AbortController().signal), () => failed.end(failed.job('failed', { problem })))).toEqual([{ event: 'problem', data: problem }]);
    const cancelled = fakeJob();
    const events = await collect(jobEvents(cancelled.source, 'id', new AbortController().signal), () => cancelled.end(cancelled.job('cancelled')));
    expect(events).toEqual([{ event: 'problem', data: expect.objectContaining({ code: 'CANCELLED' }) }]);
  });

  it('M1.7-E15 a client that leaves ends the stream without a final event', async () => {
    const fake = fakeJob();
    const leave = new AbortController();
    const seen = await collect(jobEvents(fake.source, 'id', leave.signal), () => {
      fake.send(1);
      leave.abort();
    });
    expect(seen).toEqual([{ event: 'progress', data: { source: '@test/x', data: 1 } }]);
    expect(fake.watching()).toBe(0);
  });
});
