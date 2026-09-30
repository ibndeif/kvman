import { describe, expect, it } from 'vitest';
import { countingEntry, useHarness } from '../extension-folders.ts';

const harness = useHarness();

const day = 24 * 60 * 60 * 1000;

const kept = {
  name: '@test/kept',
  namespace: 'kept',
  entry: countingEntry('kept', `
    ctx.registerCommand('kept.ok', { description: 'Succeeds.', input: z.object({}), output: z.unknown(), public: true, handle: () => 'ok' });
    ctx.registerCommand('kept.second', { description: 'Fails its first attempt.', input: z.object({}), output: z.unknown(), public: true,
      handle: async () => { if ((await bump('second')) === 1) throw new Error('first'); return 'ok'; } });
  `),
};

const notFound = { problem: { code: 'NOT_FOUND' } };

describe('retention (02 §2.1)', () => {
  it('M1.5-E9 finished jobs past the retention are deleted at start and hourly; queued ones never are', async () => {
    const kernel = await harness.start([kept]);
    const old = await kernel.execAsync('kept.ok', {});
    await kernel.clock.advance(6 * day);
    expect(await kernel.waitForJob(old)).toMatchObject({ status: 'succeeded' });
    await kernel.clock.advance(2 * day);
    await expect(kernel.waitForJob(old)).rejects.toMatchObject(notFound);
    const atStart = await kernel.execAsync('kept.ok', {});
    const queued = await kernel.execAsync('kept.second', {});
    await kernel.clock.advance(0);
    await kernel.restart({ stoppedForMs: 8 * day });
    await expect(kernel.waitForJob(atStart)).rejects.toMatchObject(notFound);
    await kernel.clock.advance(0);
    expect(await kernel.waitForJob(queued)).toMatchObject({ status: 'succeeded', attempts: 2 });
  });
});
