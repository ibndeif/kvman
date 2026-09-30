import { describe, expect, it } from 'vitest';
import type { ProgressChunk } from '../src/index.ts';
import { entry, useHarness } from './extension-folders.ts';

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
