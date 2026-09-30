import { describe, expect, it } from 'vitest';
import { z } from '@kvman/sdk';
import type { TestKernel } from '@kvman/testkit';
import { useKvwebuiKernel, type TestExtension } from './support/kvwebui-kernel.ts';

const world = useKvwebuiKernel();

const minute = 60_000;

// `fx.run` adds effects from a nested job and then itself; `fx.add` adds one effect. Both return their root job id.
const fx: TestExtension = {
  name: '@test/fx',
  namespace: 'fx',
  body: `
  const add = (effect: unknown) => ctx.exec('kvwebui.effect.add', effect);
  ctx.registerCommand('fx.inner', { description: 'Adds two effects.', input: z.object({}), output: z.object({}), public: true,
    handle: async () => { await add({ type: 'toast', text: 'fx.saved', level: 'success' }); await add({ type: 'navigate', page: 'fx.item', params: { id: '2' } }); return {}; } });
  ctx.registerCommand('fx.run', { description: 'Runs fx.inner, then adds a refresh.', input: z.object({}), output: z.string(), public: true,
    handle: async () => { await ctx.exec('fx.inner', {}); await add({ type: 'refresh' }); return ctx.job.rootId; } });
  ctx.registerCommand('fx.add', { description: 'Adds a toast.', input: z.object({ text: z.string() }), output: z.string(), public: true,
    handle: async ({ text }) => { await add({ type: 'toast', text, level: 'info' }); return ctx.job.rootId; } });`,
};

const take = (kernel: TestKernel, jobId: string) => kernel.exec('kvwebui.effect.take', { jobId });
const addToast = async (kernel: TestKernel, text: string) => z.string().parse(await kernel.exec('fx.add', { text }));

async function cleanRuns(kernel: TestKernel): Promise<number> {
  const jobs = await kernel.exec('kernel.jobs.list', { limit: 100 });
  return jobs.filter((job) => job.name === 'kvwebui.effect.clean').length;
}

describe('effects (06 §6.5)', () => {
  it('M2.3-H5 effects from a nested job are kept under the root job, and taken once', async () => {
    const kernel = await world.start([fx]);
    const rootId = z.string().parse(await kernel.exec('fx.run', {}));
    expect(await take(kernel, rootId)).toEqual([
      { type: 'toast', text: 'fx.saved', level: 'success' },
      { type: 'navigate', page: 'fx.item', params: { id: '2' } },
      { type: 'refresh' },
    ]);
    expect(await take(kernel, rootId)).toEqual([]);
  });

  it('M2.3-H7 restarting leaves one cleanup schedule, and effects older than an hour are cleaned', async () => {
    const kernel = await world.start([fx]);
    await kernel.restart();
    await kernel.restart();
    const rootId = await addToast(kernel, 'fx.old');
    await kernel.clock.advance(120 * minute);
    expect(await cleanRuns(kernel)).toBe(2);
    expect(await take(kernel, rootId)).toEqual([]);
  });

  it('M2.3-E14 effect.add validates, and effect.take returns only that job\'s effects', async () => {
    const kernel = await world.start([fx]);
    const invalid = [{ type: 'shake' }, { type: 'navigate', page: 'item' }, { type: 'toast', text: 'fx.saved', level: 'loud' }];
    for (const effect of invalid) await expect(kernel.exec('kvwebui.effect.add', effect)).rejects.toMatchObject({ problem: { code: 'VALIDATION_FAILED' } });
    const first = await addToast(kernel, 'fx.first');
    const second = await addToast(kernel, 'fx.second');
    expect(await take(kernel, first)).toEqual([{ type: 'toast', text: 'fx.first', level: 'info' }]);
    expect(await take(kernel, second)).toEqual([{ type: 'toast', text: 'fx.second', level: 'info' }]);
    expect(await take(kernel, '01900000-0000-7000-8000-000000000000')).toEqual([]);
  });

  it('M2.3-E15 cleaning keeps effects younger than an hour', async () => {
    const kernel = await world.start([fx]);
    const old = await addToast(kernel, 'fx.old');
    await kernel.clock.advance(90 * minute);
    const young = await addToast(kernel, 'fx.young');
    await kernel.clock.advance(30 * minute);
    expect(await cleanRuns(kernel)).toBeGreaterThan(0);
    expect(await take(kernel, old)).toEqual([]);
    expect(await take(kernel, young)).toEqual([{ type: 'toast', text: 'fx.young', level: 'info' }]);
  });
});
