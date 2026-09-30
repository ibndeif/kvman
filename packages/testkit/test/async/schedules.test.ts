import { describe, expect, it } from 'vitest';
import { countingEntry, entry, useHarness } from '../extension-folders.ts';

const harness = useHarness();

const minute = 60_000;

const sched = {
  name: '@test/sched',
  namespace: 'sched',
  entry: countingEntry('sched', `
    const empty = { input: z.object({}), output: z.unknown(), public: true };
    ctx.registerCommand('sched.tick', { description: 'Counts a run.', ...empty,
      handle: async () => { await ctx.store.kv.set('last', { caller: ctx.job.caller, workspaceId: ctx.job.workspace.id }); return bump('ticks'); } });
    ctx.registerCommand('sched.start', { description: 'Schedules the tick every minute.', ...empty,
      handle: () => ctx.schedule('sched.tick', {}, { cron: '* * * * *', key: 'tick' }) });
    ctx.registerCommand('sched.once', { description: 'Schedules the tick once, soon.', ...empty,
      handle: () => ctx.schedule('sched.tick', {}, { at: new Date(Date.now() + 30_000) }) });
    ctx.registerCommand('sched.cancel', { description: 'Cancels a schedule.', input: z.object({ id: z.string() }), output: z.unknown(), public: true,
      handle: async (input) => { await ctx.schedule.cancel(input.id); return null; } });
    ctx.registerCommand('sched.bad-cron', { description: 'Schedules an invalid cron.', ...empty, handle: () => ctx.schedule('sched.tick', {}, { cron: 'not a cron' }) });
    ctx.registerCommand('sched.query', { description: 'Schedules a query.', ...empty, handle: () => ctx.schedule('sched.count-get', { key: 'ticks' }, { at: new Date() }) });
  `),
};
const other = {
  name: '@test/other',
  namespace: 'other',
  entry: entry(`ctx.registerCommand('other.cancel', { description: 'Cancels a schedule.', input: z.object({ id: z.string() }), output: z.unknown(), public: true,
    handle: async (input) => { await ctx.schedule.cancel(input.id); return null; } });`),
};

describe('schedules (02 §2.4)', () => {
  it('M1.5-H3 a cron runs at each due time, a missed run runs once, and a key keeps one schedule', async () => {
    const kernel = await harness.start([sched]);
    const ticks = () => kernel.exec('sched.count-get', { key: 'ticks' });
    const id = await kernel.exec('sched.start', {});
    await kernel.clock.advance(minute);
    expect(await ticks()).toBe(1);
    await kernel.clock.advance(minute);
    expect(await ticks()).toBe(2);
    await kernel.restart({ stoppedForMs: 5 * minute });
    await kernel.clock.advance(0);
    expect(await ticks()).toBe(3);
    expect(await kernel.exec('sched.start', {})).toBe(id);
    await kernel.clock.advance(minute);
    expect(await ticks()).toBe(4);
  });

  it('M1.5-E11 a one-time schedule queues its job in the workspace with the extension as caller, then is deleted', async () => {
    const kernel = await harness.start([sched]);
    const id = await kernel.exec('sched.once', {});
    await kernel.clock.advance(minute);
    expect(await kernel.exec('sched.count-get', { key: 'ticks' })).toBe(1);
    expect(await kernel.exec('sched.count-get', { key: 'last' })).toEqual({ caller: { kind: 'extension', name: '@test/sched' }, workspaceId: 'home' });
    await expect(kernel.exec('sched.cancel', { id })).rejects.toMatchObject({ problem: { code: 'NOT_FOUND' } });
  });

  it("M1.5-E12 cancel removes a schedule; another extension's or an unknown one is not found", async () => {
    const kernel = await harness.start([sched, other]);
    const id = await kernel.exec('sched.start', {});
    await expect(kernel.exec('other.cancel', { id })).rejects.toMatchObject({ problem: { code: 'NOT_FOUND' } });
    await expect(kernel.exec('sched.cancel', { id: '0192a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b' })).rejects.toMatchObject({ problem: { code: 'NOT_FOUND' } });
    await kernel.exec('sched.cancel', { id });
    await kernel.clock.advance(5 * minute);
    expect(await kernel.exec('sched.count-get', { key: 'ticks' })).toBe(0);
  });

  it('M1.5-E13 an invalid cron and a scheduled query fail', async () => {
    const kernel = await harness.start([sched]);
    await expect(kernel.exec('sched.bad-cron', {})).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
    await expect(kernel.exec('sched.query', {})).rejects.toMatchObject({ problem: { code: 'NOT_A_COMMAND' } });
  });
});
