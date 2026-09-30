import { describe, expect, it } from 'vitest';
import { countingEntry, useHarness } from '../extension-folders.ts';

const harness = useHarness();

const stopper = {
  name: '@test/stopper',
  namespace: 'stopper',
  entry: countingEntry('stopper', `
    const empty = { input: z.object({}), output: z.unknown(), public: true };
    ctx.registerCommand('stopper.inner', { description: 'Waits for the abort.', ...empty,
      handle: async () => { await aborted(ctx.job.signal); await ctx.store.kv.set('inner-saw-abort', ctx.job.signal.aborted); return 'inner done'; } });
    ctx.registerCommand('stopper.outer', { description: 'Calls the inner command.', ...empty, handle: () => ctx.exec('stopper.inner', {}) });
    ctx.registerCommand('stopper.count', { description: 'Counts its runs.', ...empty, handle: () => bump('runs') });
    ctx.registerCommand('stopper.stubborn', { description: 'Ignores its signal.', ...empty, timeoutMs: 100, handle: () => new Promise((resolve) => setTimeout(resolve, 60_000)) });
    ctx.registerCommand('stopper.kill', { description: 'Cancels a job.', input: z.object({ jobId: z.string() }), output: z.unknown(), public: true,
      handle: async (input) => { await ctx.cancel(input.jobId); return null; } });
    ctx.registerCommand('stopper.wait-sync', { description: 'Asks for its own cancel, then waits.', ...empty,
      handle: async () => { await ctx.execAsync('stopper.kill', { jobId: ctx.job.id }); await aborted(ctx.job.signal); return 'returned'; } });
  `),
};

describe('cancel (02 §2.3, ADR 0009, 17)', () => {
  it('M1.5-H2 a cancelled job ends cancelled once its handler returns, and its nested sync job sees the abort', async () => {
    const kernel = await harness.start([stopper]);
    const id = await kernel.execAsync('stopper.outer', {});
    kernel.cancel(id);
    expect(await kernel.waitForJob(id)).toMatchObject({ status: 'cancelled' });
    expect(await kernel.exec('stopper.count-get', { key: 'inner-saw-abort' })).toBe(true);
  });

  it('M1.5-E6 a queued job ends at once, a finished one is unchanged, and an unknown id is not found', async () => {
    const kernel = await harness.start([stopper], { settings: { 'kernel.workerConcurrency': 1 } });
    const done = await kernel.execAsync('stopper.count', {});
    await kernel.clock.advance(0);
    const blocking = await kernel.execAsync('stopper.outer', {});
    const queued = await kernel.execAsync('stopper.count', {});
    kernel.cancel(queued);
    expect(await kernel.waitForJob(queued)).toMatchObject({ status: 'cancelled', attempts: 0 });
    kernel.cancel(done);
    expect(await kernel.waitForJob(done)).toMatchObject({ status: 'succeeded' });
    expect(() => kernel.cancel('0192a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b')).toThrow(expect.objectContaining({ problem: expect.objectContaining({ code: 'NOT_FOUND' }) }));
    kernel.cancel(blocking);
    await kernel.waitForJob(blocking);
    expect(await kernel.exec('stopper.count-get', { key: 'runs' })).toBe(1);
  });

  it('M1.5-E7 a running job that ignores its signal ends cancelled at its timeout', async () => {
    const kernel = await harness.start([stopper]);
    const id = await kernel.execAsync('stopper.stubborn', {});
    kernel.cancel(id);
    expect(await kernel.waitForJob(id)).toMatchObject({ status: 'cancelled', attempts: 1 });
  });

  it('M1.5-E8 a running sync job cancelled by another job gives its caller CANCELLED', async () => {
    const kernel = await harness.start([stopper]);
    await expect(kernel.exec('stopper.wait-sync', {})).rejects.toMatchObject({ problem: { code: 'CANCELLED' } });
  });
});
