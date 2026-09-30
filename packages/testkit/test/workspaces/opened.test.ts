import { describe, expect, it } from 'vitest';
import { entry, useHarness } from '../extension-folders.ts';

const harness = useHarness();

const recorder = {
  name: '@test/o',
  namespace: 'o',
  entry: entry(`
  ctx.registerHandler('kernel.workspace.opened', { description: 'Records opened workspaces.', handle: (input) => {
    const where = input.workspaceId + '@' + ctx.job.workspace.id;
    ctx.store.transaction((tx) => { tx.global.kv.set('opened', [...z.array(z.string()).parse(tx.global.kv.get('opened') ?? []), where]); });
  } });
  ctx.registerQuery('o.opened-get', { description: 'Reads the record.', input: z.object({}), output: z.unknown(), public: true,
    handle: async () => (await ctx.store.global.kv.get('opened')) ?? [] });`),
};

describe('kernel.workspace.opened (02 §2.15)', () => {
  it('M1.6-H10 a new home and a new path trigger it once, in that workspace; reopening and restarting do not', async () => {
    const kernel = await harness.start([recorder]);
    await kernel.clock.advance(0);
    expect(await kernel.exec('o.opened-get', {})).toEqual(['home@home']);
    const folder = harness.temporaryFolder();
    const workspace = await kernel.exec('kernel.workspace.open', { path: folder });
    await kernel.exec('kernel.workspace.open', { path: folder });
    await kernel.exec('kernel.workspace.close', { workspaceId: workspace.id });
    await kernel.exec('kernel.workspace.open', { path: folder });
    await kernel.restart();
    await kernel.clock.advance(0);
    expect(await kernel.exec('o.opened-get', {})).toEqual(['home@home', `${workspace.id}@${workspace.id}`]);
  });
});
