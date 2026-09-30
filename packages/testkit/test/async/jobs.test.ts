import { describe, expect, it } from 'vitest';
import { countingEntry, useHarness } from '../extension-folders.ts';

const harness = useHarness();

const queue = {
  name: '@test/queue',
  namespace: 'queue',
  entry: countingEntry('queue', `
    ctx.registerCommand('queue.append', { description: 'Appends its index.', input: z.object({ index: z.number() }), output: z.unknown(), public: true,
      handle: async (input) => { const list = z.array(z.number()).parse((await ctx.store.kv.get('order')) ?? []); await ctx.store.kv.set('order', [...list, input.index]); return null; } });
    ctx.registerCommand('queue.describe', { description: 'Returns its ids.', input: z.object({}), output: z.object({ id: z.string(), rootId: z.string() }), public: true,
      handle: () => ({ id: ctx.job.id, rootId: ctx.job.rootId }) });
    ctx.registerQuery('queue.peek-get', { description: 'A query.', input: z.object({}), output: z.unknown(), public: true, handle: () => null });
    ctx.registerQuery('queue.sneaky-get', { description: 'Queues from a query.', input: z.object({ how: z.string() }), output: z.unknown(), public: true,
      handle: (input) => input.how === 'async' ? ctx.execAsync('queue.describe', {}) : ctx.schedule('queue.describe', {}, { at: new Date() }) });
    ctx.registerQuery('queue.progress-get', { description: 'Sends a big chunk.', input: z.object({}), output: z.unknown(), public: true,
      handle: () => { ctx.job.progress('x'.repeat(70 * 1024)); return null; } });
  `),
};

describe('async jobs (02 §2.1)', () => {
  it('M1.5-E1 a query cannot be queued, and a query cannot queue or schedule', async () => {
    const kernel = await harness.start([queue]);
    await expect(kernel.execAsync('queue.peek-get', {})).rejects.toMatchObject({ problem: { code: 'NOT_A_COMMAND' } });
    await expect(kernel.exec('queue.sneaky-get', { how: 'async' })).rejects.toMatchObject({ problem: { code: 'READ_ONLY' } });
    await expect(kernel.exec('queue.sneaky-get', { how: 'schedule' })).rejects.toMatchObject({ problem: { code: 'READ_ONLY' } });
  });

  it('M1.5-E2 jobs start in the order they were queued', async () => {
    const kernel = await harness.start([queue], { settings: { 'kernel.workerConcurrency': 1 } });
    for (const index of [0, 1, 2, 3, 4]) await kernel.execAsync('queue.append', { index });
    await kernel.clock.advance(0);
    expect(await kernel.exec('queue.count-get', { key: 'order' })).toEqual([0, 1, 2, 3, 4]);
  });

  it('M1.5-E3 a job row has its caller, workspace, attempts, retries, output, and times; rootId is its id', async () => {
    const kernel = await harness.start([queue]);
    const id = await kernel.execAsync('queue.describe', {});
    const job = await kernel.waitForJob(id);
    expect(job).toMatchObject({ id, name: 'queue.describe', caller: { kind: 'user' }, workspaceId: 'home', status: 'succeeded', attempts: 1, retries: 3, output: { id, rootId: id } });
    expect(job.createdAt <= (job.startedAt ?? '') && (job.startedAt ?? '') <= (job.endedAt ?? '')).toBe(true);
  });

  it('M1.5-E10 a progress chunk over 64 KiB fails TOO_LARGE', async () => {
    const kernel = await harness.start([queue]);
    await expect(kernel.exec('queue.progress-get', {})).rejects.toMatchObject({ problem: { code: 'TOO_LARGE', params: { limit: 65536 } } });
  });
});
