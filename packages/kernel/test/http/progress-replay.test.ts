import { describe, expect, it } from 'vitest';
import { createProgressHub, type ProgressChunk } from '../../src/jobs/progress-hub.ts';

// A job's end, driven by the test.
function hubWith(replayBytes?: number) {
  let end: () => void = () => undefined;
  let fail: (error: unknown) => void = () => undefined;
  const ended = new Promise<void>((resolve, reject) => {
    end = resolve;
    fail = reject;
  });
  const hub = createProgressHub(() => ended, replayBytes);
  const watch = (jobId: string): ProgressChunk[] => {
    const seen: ProgressChunk[] = [];
    hub.watch(jobId, (chunk) => seen.push(chunk));
    return seen;
  };
  const chunk = (data: number | string): ProgressChunk => ({ source: '@test/x', data });
  return { hub, watch, chunk, end, fail };
}

describe("a running job's replay (04 §4.4, ADR 0009, 139)", () => {
  it('QA2-H2 a client that connects late gets the chunks so far, in order, then the live ones', () => {
    const { hub, watch, chunk } = hubWith();
    hub.publish('job', chunk(1));
    hub.publish('job', chunk(2));
    const seen = watch('job');
    hub.publish('job', chunk(3));
    expect(seen).toEqual([chunk(1), chunk(2), chunk(3)]);
  });

  it('QA2-E2 past the limit the oldest chunks are dropped first, and the newest is always kept', () => {
    const { hub, watch, chunk } = hubWith(200);
    for (let index = 0; index < 10; index += 1) hub.publish('job', chunk('x'.repeat(30) + String(index)));
    const seen = watch('job');
    expect(seen.map((replayed) => String(replayed.data).slice(-1))).toEqual(['7', '8', '9']);
    hub.publish('job', chunk('y'.repeat(500)));
    expect(watch('job')).toEqual([chunk('y'.repeat(500))]);
  });

  it("QA2-E3 a job's buffer goes when it ends, and another job's stays", async () => {
    const { hub, watch, chunk, end } = hubWith();
    hub.publish('job', chunk(1));
    end();
    await Promise.resolve();
    await Promise.resolve();
    expect(watch('job')).toEqual([]);
    const other = hubWith();
    other.hub.publish('other', other.chunk(1));
    expect(other.watch('other')).toEqual([other.chunk(1)]);
  });

  it('QA2-E3 a job with no row, as a sync job has, drops its buffer too', async () => {
    const { hub, watch, chunk, fail } = hubWith();
    hub.publish('job', chunk(1));
    fail(new Error('no row'));
    await Promise.resolve();
    await Promise.resolve();
    expect(watch('job')).toEqual([]);
  });
});
