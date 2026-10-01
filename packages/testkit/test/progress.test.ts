import { describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import type { ProgressChunk } from '../src/index.ts';
import { entry, gateEntry, openGate, useHarness } from './extension-folders.ts';

const harness = useHarness();

// `pr.run` sends `<tag>:1`, then its nested query sends `<tag>:2`, then it sends `<tag>:3`.
const progress = {
  name: '@test/pr',
  namespace: 'pr',
  entry: entry(`
  ctx.registerQuery('pr.inner-get', { description: 'Sends one chunk.', input: z.object({ tag: z.string() }), output: z.null(), public: true,
    handle: (input) => { ctx.job.progress(input.tag + ':2'); return null; } });
  ctx.registerCommand('pr.run', { description: 'Sends three chunks.', input: z.object({ tag: z.string() }), output: z.null(), public: true,
    handle: async (input) => { ctx.job.progress(input.tag + ':1'); await ctx.exec('pr.inner-get', input); ctx.job.progress(input.tag + ':3'); return null; } });`),
};

// `pr.queue` queues `pr.later`, which waits at a gate, then sends two chunks.
const queued = {
  name: '@test/pq',
  namespace: 'pq',
  entry: entry(`${gateEntry}
  ctx.registerCommand('pq.later', { description: 'Waits, then sends two chunks.', input: z.object({}), output: z.null(), public: true,
    handle: async () => { await gate('pq'); ctx.job.progress('one'); ctx.job.progress('two'); return null; } });
  ctx.registerCommand('pq.queue', { description: 'Queues pq.later.', input: z.object({}), output: z.string(), public: true, handle: () => ctx.execAsync('pq.later', {}) });`),
};

const chunksOf = (tag: string): ProgressChunk[] => [1, 2, 3].map((index) => ({ source: '@test/pr', data: `${tag}:${String(index)}` }));

describe("the testkit's onProgress (ADR 0009, 61)", () => {
  it("M2.1-H9 onProgress gets every chunk of the call's root job, for exec and execAsync, and only its own", async () => {
    const kernel = await harness.start([progress]);
    const seen: Record<string, ProgressChunk[]> = { a: [], b: [], c: [] };
    const watch = (tag: string) => ({ onProgress: (chunk: ProgressChunk) => seen[tag]?.push(chunk) });
    await Promise.all([kernel.exec('pr.run', { tag: 'a' }, watch('a')), kernel.exec('pr.run', { tag: 'b' }, watch('b'))]);
    const jobId = await kernel.execAsync('pr.run', { tag: 'c' }, watch('c'));
    await expect(kernel.waitForJob(jobId)).resolves.toMatchObject({ status: 'succeeded' });
    expect(seen).toEqual({ a: chunksOf('a'), b: chunksOf('b'), c: chunksOf('c') });
    await expect(kernel.exec('pr.run', { tag: 'd' })).resolves.toBeNull();
  });
});

describe("the testkit's watch (ADR 0009, 108)", () => {
  it('M2.4-E62 watch receives the chunks of a job the test did not start, from then on, until stopped', async () => {
    const kernel = await harness.start([queued]);
    const gate = openGate('pq');
    const jobId = z.string().parse(await kernel.exec('pq.queue', {}));
    await gate.waiting;
    const seen: ProgressChunk[] = [];
    const stop = kernel.watch(jobId, (chunk) => {
      seen.push(chunk);
      if (chunk.data === 'one') stop();
    });
    gate.release();
    await kernel.waitForJob(jobId);
    expect(seen).toEqual([{ source: '@test/pq', data: 'one' }]);
  });
});
