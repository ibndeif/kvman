import { describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import { countingEntry, entry, useHarness } from '../extension-folders.ts';

const harness = useHarness();

const watch = {
  name: '@test/watch',
  namespace: 'watch',
  entry: countingEntry('watch', `
    const call = z.object({ point: z.string(), info: z.string(), caller: z.string(), workspaceId: z.string() });
    const calls = () => ctx.store.global.collection('calls', call);
    const record = (point: string, info: unknown) => calls().insert({ point, info: JSON.stringify(info), caller: JSON.stringify(ctx.job.caller), workspaceId: ctx.job.workspace.id });
    const empty = { input: z.object({}), output: z.unknown(), public: true };
    ctx.registerCommand('watch.fail', { description: 'Fails.', ...empty, handle: () => { throw new Error('broken'); } });
    ctx.registerCommand('watch.trigger', { description: 'Fails, and makes the handler misbehave.', ...empty, handle: () => { throw new Error('broken'); } });
    ctx.registerCommand('watch.ok', { description: 'Succeeds.', ...empty, handle: () => 'ok' });
    ctx.registerCommand('watch.wait', { description: 'Waits for its abort.', ...empty, handle: async () => { await aborted(ctx.job.signal); return null; } });
    ctx.registerQuery('watch.calls-list', { description: 'Lists the handler calls.', ...empty,
      handle: async () => (await calls().find({}, { limit: 100 })).map((found) => ({ ...found, info: JSON.parse(found.info), caller: JSON.parse(found.caller) })) });
    ctx.registerHandler('kernel.job.failed', { description: 'Records failures.', retries: 0, handle: async (info) => {
      await record('failed', info);
      if (info.name !== 'watch.trigger') return;
      await ctx.exec('watch.fail', {}).catch(() => undefined);
      await ctx.execAsync('watch.fail', {});
      await ctx.schedule('watch.fail', {}, { at: new Date() });
      throw new Error('the handler fails too');
    } });
    ctx.registerHandler('kernel.job.succeeded', { description: 'Records successes.', handle: (info) => record('succeeded', info).then(() => undefined) });
    ctx.registerHandler('kernel.job.cancelled', { description: 'Records cancels.', handle: (info) => record('cancelled', info).then(() => undefined) });
    ctx.registerHandler('kernel.started', { description: 'Counts starts.', handle: () => bump('started').then(() => undefined) });
  `),
};

const handlerCall = z.object({ point: z.string(), info: z.record(z.string(), z.unknown()), caller: z.unknown(), workspaceId: z.string() });

describe('handler points (02 §2.15)', () => {
  it('M1.5-H4 failed jobs queue one kernel.job.failed handler job, and handler chains never loop', async () => {
    const kernel = await harness.start([watch]);
    const failures = async () => z.array(handlerCall).parse(await kernel.exec('watch.calls-list', {})).filter((found) => found.point === 'failed');
    await expect(kernel.exec('watch.fail', {})).rejects.toMatchObject({ problem: { code: 'HANDLER_FAILED' } });
    await kernel.clock.advance(0);
    const asyncId = await kernel.execAsync('watch.fail', {});
    await kernel.clock.advance(10_000);
    await expect(kernel.exec('watch.trigger', {})).rejects.toMatchObject({ problem: { code: 'HANDLER_FAILED' } });
    await kernel.clock.advance(10_000);
    const found = await failures();
    expect(found.map((call) => call.info['name'])).toEqual(['watch.fail', 'watch.fail', 'watch.trigger']);
    expect(found[0]?.info).toMatchObject({ caller: { kind: 'user' }, workspaceId: 'home', attempts: 1, problem: { code: 'HANDLER_FAILED' } });
    expect(found[0]?.info['jobId']).toBe(found[0]?.info['rootId']);
    expect(found[1]?.info).toMatchObject({ jobId: asyncId, rootId: asyncId, attempts: 4 });
    expect(await kernel.exec('watch.count-get', { key: 'started' })).toBe(1);
    await kernel.restart();
    expect(await kernel.exec('watch.count-get', { key: 'started' })).toBe(2);
  });

  it('M1.5-E14 an unknown point, or two handlers of one extension for one point, fails the load', async () => {
    const unknown = entry("ctx.registerHandler('kernel.nope' as never, { description: 'Waits.', handle: () => undefined });");
    await expect(harness.start([{ name: '@test/a', namespace: 'a', entry: unknown }])).rejects.toMatchObject({ problem: { code: 'EXTENSION_INVALID' } });
    const twice = entry("for (const n of [1, 2]) ctx.registerHandler('kernel.started', { description: 'Starts.', handle: () => undefined });");
    await expect(harness.start([{ name: '@test/a', namespace: 'a', entry: twice }])).rejects.toMatchObject({ problem: { code: 'EXTENSION_INVALID' } });
  });

  it('M1.5-E15 a success and a cancel queue their handler jobs; a sync success queues none', async () => {
    const kernel = await harness.start([watch]);
    await kernel.exec('watch.ok', {});
    const ok = await kernel.execAsync('watch.ok', {});
    const waiting = await kernel.execAsync('watch.wait', {});
    kernel.cancel(waiting);
    await kernel.clock.advance(0);
    const found = z.array(handlerCall).parse(await kernel.exec('watch.calls-list', {}));
    expect(found.map((call) => call.point).sort()).toEqual(['cancelled', 'succeeded']);
    expect(found.find((call) => call.point === 'succeeded')?.info).toMatchObject({ jobId: ok, rootId: ok, name: 'watch.ok', caller: { kind: 'user' }, workspaceId: 'home' });
    expect(found.find((call) => call.point === 'cancelled')?.info).toMatchObject({ jobId: waiting, name: 'watch.wait', reason: 'cancel' });
  });

  it("M1.5-E16 handler jobs run as the kernel, in the job's workspace, with the handler's retries", async () => {
    const retrying = {
      name: '@test/retrying',
      namespace: 'retrying',
      entry: countingEntry('retrying', "ctx.registerHandler('kernel.job.succeeded', { description: 'Fails once more.', retries: 1, handle: async () => { await bump('runs'); throw new Error('again'); } });"),
    };
    const kernel = await harness.start([watch, retrying]);
    await kernel.execAsync('watch.ok', {});
    await kernel.clock.advance(1000);
    const found = z.array(handlerCall).parse(await kernel.exec('watch.calls-list', {}));
    expect(found[0]).toMatchObject({ caller: { kind: 'kernel' }, workspaceId: 'home' });
    expect(await kernel.exec('retrying.count-get', { key: 'runs' })).toBe(2);
  });
});
