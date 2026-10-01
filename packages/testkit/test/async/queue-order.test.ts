import { describe, expect, it } from 'vitest';
import { entry, useHarness } from '../extension-folders.ts';

const harness = useHarness();

// `order.parent` queues `order.child` and, right after it has the id, records `parent`; the child records `child`.
const order = {
  name: '@test/order',
  namespace: 'order',
  entry: entry(`
  const mark = async (name: string) => { const list = z.array(z.string()).parse((await ctx.store.kv.get('marks')) ?? []); await ctx.store.kv.set('marks', [...list, name]); };
  ctx.registerCommand('order.child', { description: 'Records child.', input: z.object({}), output: z.null(), public: true, handle: async () => { await mark('child'); return null; } });
  ctx.registerCommand('order.parent', { description: 'Queues the child, then records parent.', input: z.object({}), output: z.null(), public: true,
    handle: async () => { await ctx.execAsync('order.child', {}); await mark('parent'); return null; } });
  ctx.registerQuery('order.marks-get', { description: 'Gives the marks.', input: z.object({}), output: z.unknown(), public: true, handle: async () => (await ctx.store.kv.get('marks')) ?? [] });`),
};

describe('queued jobs start after their caller has the id (02 §2.1)', () => {
  it('M2.4-E64 a job queued from a handler starts only after the handler has its id', async () => {
    const kernel = await harness.start([order]);
    for (let round = 0; round < 5; round += 1) await kernel.exec('order.parent', {});
    await kernel.clock.advance(0);
    const marks = await kernel.exec('order.marks-get', {});
    expect(marks).toEqual(['parent', 'child', 'parent', 'child', 'parent', 'child', 'parent', 'child', 'parent', 'child']);
  });
});
