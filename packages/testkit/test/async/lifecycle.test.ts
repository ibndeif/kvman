import { describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import { countingEntry, useHarness, type TestExtension } from '../extension-folders.ts';

const harness = useHarness();

const logsOnStart = (name: string, extra: Partial<TestExtension> = {}): TestExtension => ({
  name: `@test/${name}`,
  namespace: name,
  entry: countingEntry(name, `ctx.registerHandler('kernel.started', { description: 'Logs its start.', handle: () => { ctx.log.info('started', { who: '${name}' }); } });`),
  ...extra,
});

describe('kernel.started and kernel.stopping (02 §2.14, §2.15)', () => {
  it('M1.5-E17 started handlers run once, in dependency order, before ready; a failing one is logged', async () => {
    const failing = {
      name: '@test/failing',
      namespace: 'failing',
      entry: countingEntry('failing', "ctx.registerHandler('kernel.started', { description: 'Fails.', retries: 0, handle: () => { throw new Error('no start'); } });"),
    };
    const kernel = await harness.start([logsOnStart('b', { dependencies: { '@test/a': '^0.1.0' } }), failing, logsOnStart('a')]);
    const lines = harness.logLines(kernel);
    expect(lines.filter((line) => line['msg'] === 'started').map((line) => line['who'])).toEqual(['a', 'b']);
    expect(lines.some((line) => line['msg'] === 'A kernel.started handler failed.')).toBe(true);
  });

  it('M1.5-E18 stopping handlers run before jobs are aborted; one still running at the end is dropped', async () => {
    const stopper = {
      name: '@test/stopper',
      namespace: 'stopper',
      entry: countingEntry('stopper', `
        ctx.registerCommand('stopper.wait', { description: 'Waits for its abort.', input: z.object({}), output: z.unknown(), public: true,
          handle: async () => { await aborted(ctx.job.signal); await ctx.store.global.kv.set('job-aborted', true); return null; } });
        ctx.registerHandler('kernel.stopping', { description: 'Sees whether jobs were aborted yet.', handle: async () => {
          await ctx.store.global.kv.set('saw-abort', (await ctx.store.global.kv.get('job-aborted')) ?? false); } });
        ctx.registerQuery('stopper.global-get', { description: 'Reads a global key.', input: z.object({ key: z.string() }), output: z.unknown(), public: true,
          handle: async (input) => (await ctx.store.global.kv.get(input.key)) ?? null });
      `),
    };
    const lingering = {
      name: '@test/lingering',
      namespace: 'lingering',
      entry: countingEntry('lingering', `
        ctx.registerHandler('kernel.stopping', { description: 'Outlasts shutdown.', handle: async () => {
          if ((await bump('runs')) > 1) return;
          await ctx.store.global.kv.set('handler-job', ctx.job.id); await aborted(ctx.job.signal); throw new Error('stopped'); } });
        ctx.registerQuery('lingering.global-get', { description: 'Reads a global key.', input: z.object({ key: z.string() }), output: z.unknown(), public: true,
          handle: async (input) => (await ctx.store.global.kv.get(input.key)) ?? null });
      `),
    };
    const kernel = await harness.start([stopper, lingering]);
    await kernel.execAsync('stopper.wait', {});
    await kernel.restart();
    expect(await kernel.exec('stopper.global-get', { key: 'saw-abort' })).toBe(false);
    expect(await kernel.exec('stopper.global-get', { key: 'job-aborted' })).toBe(true);
    const handlerJob = z.string().parse(await kernel.exec('lingering.global-get', { key: 'handler-job' }));
    expect(await kernel.waitForJob(handlerJob)).toMatchObject({ status: 'failed', problem: { code: 'INTERRUPTED' }, attempts: 1 });
    await kernel.clock.advance(60_000);
    expect(await kernel.exec('lingering.count-get', { key: 'runs' })).toBe(1);
  }, 30_000);
});
