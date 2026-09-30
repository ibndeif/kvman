import { describe, expect, it } from 'vitest';
import { countingEntry, useHarness } from '../extension-folders.ts';

const harness = useHarness();

const paused = {
  name: '@test/p',
  namespace: 'p',
  entry: countingEntry(
    'p',
    `
  ctx.registerCommand('p.flaky', { description: 'Fails its first attempt.', input: z.object({}), output: z.number(), public: true,
    handle: async () => { const attempt = await bump('flaky'); if (attempt === 1) throw new Error('first attempt'); return attempt; } });
  ctx.registerCommand('p.count', { description: 'Counts.', input: z.object({ key: z.string() }), output: z.number(), public: true, handle: (input) => bump(input.key) });
  ctx.registerCommand('p.later', { description: 'Schedules a count.', input: z.object({ at: z.number() }), output: z.string(), public: true,
    handle: (input) => ctx.schedule('p.count', { key: 'scheduled' }, { at: new Date(input.at) }) });`,
  ),
};

describe('closing pauses (02 §2.6)', () => {
  it('M1.6-H2 a closed workspace\'s queued job and due schedule wait, and run once it is reopened', async () => {
    const kernel = await harness.start([paused]);
    const folder = harness.temporaryFolder();
    const workspace = await kernel.exec('kernel.workspace.open', { path: folder });
    await kernel.exec('p.later', { at: kernel.clock.now() + 60_000 }, { workspaceId: workspace.id });
    const queuedId = await kernel.execAsync('p.flaky', {}, { workspaceId: workspace.id });
    await kernel.clock.advance(0);
    await kernel.exec('kernel.workspace.close', { workspaceId: workspace.id });
    await kernel.clock.advance(120_000);
    expect(await kernel.exec('kernel.jobs.get', { id: queuedId })).toMatchObject({ status: 'queued', attempts: 1 });
    const reopenedAt = new Date(kernel.clock.now()).toISOString();
    await kernel.exec('kernel.workspace.open', { path: folder });
    await kernel.clock.advance(0);
    const counts = (await kernel.exec('kernel.jobs.list', { limit: 100 }, { workspaceId: workspace.id })).filter((job) => job.name === 'p.count');
    expect(counts.map((job) => job.createdAt)).toEqual([reopenedAt]);
    expect(await kernel.exec('kernel.jobs.get', { id: queuedId })).toMatchObject({ status: 'succeeded', attempts: 2, output: 2 });
    expect(await kernel.exec('p.count-get', { key: 'scheduled' }, { workspaceId: workspace.id })).toBe(1);
  });
});
