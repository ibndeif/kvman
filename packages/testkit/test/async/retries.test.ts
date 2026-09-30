import { describe, expect, it } from 'vitest';
import { countingEntry, useHarness } from '../extension-folders.ts';

const harness = useHarness();

const flaky = {
  name: '@test/flaky',
  namespace: 'flaky',
  entry: countingEntry('flaky', `
    const empty = { input: z.object({}), output: z.unknown(), public: true };
    ctx.registerCommand('flaky.fail', { description: 'Always throws.', ...empty, handle: async () => { await bump('fail'); throw new Error('broken'); } });
    ctx.registerCommand('flaky.problem', { description: 'Throws a Problem.', ...empty, handle: async () => { await bump('problem'); throw ctx.problem('flaky/NOPE'); } });
    ctx.registerCommand('flaky.strict', { description: 'Takes a number.', input: z.object({ value: z.number() }), output: z.unknown(), public: true, handle: () => bump('strict') });
    ctx.registerCommand('flaky.slow', { description: 'Outlives its timeout.', ...empty, timeoutMs: 50, retries: 1, handle: async () => { await bump('slow'); await new Promise(() => undefined); } });
    ctx.registerCommand('flaky.crash', { description: 'Ends its worker.', ...empty, retries: 1, handle: async () => { await bump('crash'); process.exit(1); } });
  `),
};

describe('retries (02 §2.3, ADR 0009, 14)', () => {
  it('M1.5-H1 a failing job retries three times with 1, 2, and 4 s backoff, then ends failed', async () => {
    const kernel = await harness.start([flaky]);
    const count = () => kernel.exec('flaky.count-get', { key: 'fail' });
    const id = await kernel.execAsync('flaky.fail', {});
    await kernel.clock.advance(0);
    expect(await count()).toBe(1);
    await kernel.clock.advance(999);
    expect(await count()).toBe(1);
    await kernel.clock.advance(1);
    expect(await count()).toBe(2);
    await kernel.clock.advance(2000);
    expect(await count()).toBe(3);
    await kernel.clock.advance(4000);
    expect(await count()).toBe(4);
    expect(await kernel.waitForJob(id)).toMatchObject({ status: 'failed', attempts: 4, retries: 3, problem: { code: 'HANDLER_FAILED' } });
  });

  it('M1.5-E4 a Problem, or an input that does not fit, ends the job after one attempt', async () => {
    const kernel = await harness.start([flaky]);
    const problem = await kernel.execAsync('flaky.problem', {});
    const strict = await kernel.execAsync('flaky.strict', { value: 'x' } as never);
    await kernel.clock.advance(60_000);
    expect(await kernel.waitForJob(problem)).toMatchObject({ status: 'failed', attempts: 1, problem: { code: 'flaky/NOPE' } });
    expect(await kernel.waitForJob(strict)).toMatchObject({ status: 'failed', attempts: 1, problem: { code: 'VALIDATION_FAILED' } });
    expect(await kernel.exec('flaky.count-get', { key: 'problem' })).toBe(1);
  });

  it('M1.5-E5 a timeout and a worker crash are retried, then end failed with their code', async () => {
    const kernel = await harness.start([flaky]);
    const slow = await kernel.execAsync('flaky.slow', {});
    await kernel.clock.advance(1000);
    expect(await kernel.waitForJob(slow)).toMatchObject({ status: 'failed', attempts: 2, problem: { code: 'TIMEOUT' } });
    const crash = await kernel.execAsync('flaky.crash', {});
    await kernel.clock.advance(1000);
    expect(await kernel.waitForJob(crash)).toMatchObject({ status: 'failed', attempts: 2, problem: { code: 'WORKER_CRASHED' } });
  });
});
