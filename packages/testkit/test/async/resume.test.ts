import { describe, expect, it } from 'vitest';
import { countingEntry, useHarness } from '../extension-folders.ts';

const harness = useHarness();

const resume = {
  name: '@test/resume',
  namespace: 'resume',
  entry: countingEntry('resume', `
    const empty = { input: z.object({}), output: z.unknown(), public: true };
    const waitOnce = async (key: string) => {
      if ((await bump(key)) > 1) return 'finished on a later attempt';
      await aborted(ctx.job.signal);
      throw new Error('cut off');
    };
    ctx.registerCommand('resume.retrying', { description: 'Waits on its first attempt.', ...empty, handle: () => waitOnce('retrying') });
    ctx.registerCommand('resume.once', { description: 'Waits, with no retries.', ...empty, retries: 0, handle: () => waitOnce('once') });
    ctx.registerCommand('resume.quick', { description: 'Finishes at once.', ...empty, handle: () => bump('quick') });
  `),
};

describe('resuming after a stop (02 §2.3, §2.14)', () => {
  it('M1.5-H5 closing mid-job interrupts the attempt; reopening resumes only what should run', async () => {
    const kernel = await harness.start([resume]);
    const quick = await kernel.execAsync('resume.quick', {});
    await kernel.waitForJob(quick);
    const retrying = await kernel.execAsync('resume.retrying', {});
    const once = await kernel.execAsync('resume.once', {});
    await kernel.restart();
    expect(await kernel.waitForJob(once)).toMatchObject({ status: 'failed', attempts: 1, problem: { code: 'INTERRUPTED' } });
    await kernel.clock.advance(1000);
    expect(await kernel.waitForJob(retrying)).toMatchObject({ status: 'succeeded', attempts: 2, output: 'finished on a later attempt' });
    expect(await kernel.exec('resume.count-get', { key: 'quick' })).toBe(1);
  });
});
