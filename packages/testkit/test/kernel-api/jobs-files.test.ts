import { describe, expect, it } from 'vitest';
import { fileSchema } from '@kvman/sdk';
import { entry, useHarness } from '../extension-folders.ts';

const harness = useHarness();

const worker = {
  name: '@test/j',
  namespace: 'j',
  entry: entry(`
  ctx.registerCommand('j.work', { description: 'Works.', input: z.object({}), output: z.object({}), public: true, handle: () => ({}) });
  ctx.registerCommand('j.fail', { description: 'Fails.', input: z.object({}), output: z.object({}), public: true, handle: () => { throw ctx.problem('j/NOPE'); } });
  ctx.registerCommand('j.file-write', { description: 'Writes a file.', input: z.object({ name: z.string() }), output: z.unknown(), public: true,
    handle: (input) => ctx.files.write(input.name, 'x', 'text/plain') });`),
};

describe('kernel.jobs.* and kernel.files.* (02 §2.12)', () => {
  it('M1.6-H5 lists are the call\'s workspace, newest first; a job is found in any workspace, a file only in its own', async () => {
    const kernel = await harness.start([worker]);
    const workspace = await kernel.exec('kernel.workspace.open', { path: harness.temporaryFolder() });
    const inWorkspace = { workspaceId: workspace.id };
    const worked = await kernel.execAsync('j.work', {});
    const elsewhere = await kernel.execAsync('j.work', {}, inWorkspace);
    const failed = await kernel.execAsync('j.fail', {});
    await kernel.clock.advance(0);
    expect((await kernel.exec('kernel.jobs.list', { limit: 10 })).map((job) => job.id)).toEqual([failed, worked]);
    expect((await kernel.exec('kernel.jobs.list', { status: 'failed', limit: 10 })).map((job) => job.id)).toEqual([failed]);
    expect((await kernel.exec('kernel.jobs.list', { limit: 10 }, inWorkspace)).map((job) => job.id)).toEqual([elsewhere]);
    expect(await kernel.exec('kernel.jobs.get', { id: elsewhere })).toMatchObject({ id: elsewhere, workspaceId: workspace.id, status: 'succeeded' });
    const write = async (name: string, options = {}) => fileSchema.parse(await kernel.exec('j.file-write', { name }, options));
    const first = await write('a.txt');
    const second = await write('b.txt');
    const theirs = await write('c.txt', inWorkspace);
    expect(await kernel.exec('kernel.files.list', { limit: 10 })).toEqual([second, first]);
    expect(await kernel.exec('kernel.files.list', { limit: 10 }, inWorkspace)).toEqual([theirs]);
    expect(await kernel.exec('kernel.files.get', { id: theirs.id }, inWorkspace)).toEqual(theirs);
    await expect(kernel.exec('kernel.files.get', { id: theirs.id })).rejects.toMatchObject({ problem: { code: 'NOT_FOUND' } });
  });

  it('M1.6-E15 kernel.jobs.get of an unknown id is NOT_FOUND', async () => {
    const kernel = await harness.start([worker]);
    await expect(kernel.exec('kernel.jobs.get', { id: '0192e0a0-0000-7000-8000-000000000000' })).rejects.toMatchObject({ problem: { code: 'NOT_FOUND' } });
  });
});
