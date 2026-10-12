import { existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { z } from '@kvman/sdk';
import { alive, countingEntry, processOwner, reloadWait, scripts, useHarness } from '../extension-folders.ts';

const harness = useHarness();

const owner = {
  name: '@test/d',
  namespace: 'd',
  entry: countingEntry(
    'd',
    `
  ctx.registerCommand('d.count', { description: 'Counts.', input: z.object({ key: z.string() }), output: z.number(), public: true, handle: (input) => bump(input.key) });
  ctx.registerCommand('d.write', { description: 'Writes a file.', input: z.object({}), output: z.unknown(), public: true, handle: () => ctx.files.write('a.txt', 'x', 'text/plain') });
  ctx.registerCommand('d.hold', { description: 'Runs until it is cancelled.', input: z.object({}), output: z.object({}), public: true,
    handle: async () => { await bump('held'); await aborted(ctx.job.signal); ctx.job.signal.throwIfAborted(); return {}; } });
  ctx.registerHandler('kernel.workspace.deleted', { description: 'Records deleted workspaces.', handle: (input) => {
    const where = input.workspaceId + '@' + ctx.job.workspace.id;
    ctx.store.transaction((tx) => { tx.global.kv.set('deleted', [...z.array(z.string()).parse(tx.global.kv.get('deleted') ?? []), where]); });
  } });
  ctx.registerQuery('d.deleted-get', { description: 'Reads the record.', input: z.object({}), output: z.unknown(), public: true,
    handle: async () => (await ctx.store.global.kv.get('deleted')) ?? [] });`,
  ),
};

const fileSchema = z.object({ id: z.string() });
const infoSchema = z.object({ pid: z.number() });
const problem = (code: string) => ({ problem: { code } });

describe('closed workspaces and deleting one (02 §2.6, ADR 0061)', () => {
  it("M2.4-E201 a workspace whose folder is gone is closed at the next start with its data kept, and comes back when the folder does", async () => {
    const kernel = await harness.start([owner]);
    const folder = path.join(harness.temporaryFolder(), 'project');
    mkdirSync(folder);
    const workspace = await kernel.exec('kernel.workspace.open', { path: folder });
    await kernel.exec('d.count', { key: 'kept' }, { workspaceId: workspace.id });
    rmSync(folder, { recursive: true });
    await kernel.restart();
    expect((await kernel.exec('kernel.workspace.list', {})).map((listed) => listed.id)).not.toContain(workspace.id);
    expect(await kernel.exec('kernel.workspace.closed.list', {})).toEqual([{ ...workspace, missing: true }]);
    mkdirSync(folder);
    expect(await kernel.exec('kernel.workspace.closed.list', {})).toEqual([{ ...workspace, missing: false }]);
    expect((await kernel.exec('kernel.workspace.open', { path: folder })).id).toBe(workspace.id);
    expect(await kernel.exec('d.count-get', { key: 'kept' }, { workspaceId: workspace.id })).toBe(1);
  });

  it('M2.4-E204, E206 and E207 delete refuses Home, an open and an unknown workspace; a deleted one tells its handler once in Home, and its path opens as a new workspace', async () => {
    const kernel = await harness.start([owner]);
    const folder = harness.temporaryFolder();
    const workspace = await kernel.exec('kernel.workspace.open', { path: folder });
    await kernel.exec('d.count', { key: 'old' }, { workspaceId: workspace.id });
    const file = fileSchema.parse(await kernel.exec('d.write', {}, { workspaceId: workspace.id }));
    const queued = await kernel.execAsync('d.count', { key: 'queued' }, { workspaceId: workspace.id });
    await kernel.waitForJob(queued);
    await expect(kernel.exec('kernel.workspace.delete', { workspaceId: 'home' })).rejects.toMatchObject(problem('VALIDATION_FAILED'));
    await expect(kernel.exec('kernel.workspace.delete', { workspaceId: workspace.id })).rejects.toMatchObject(problem('VALIDATION_FAILED'));
    await expect(kernel.exec('kernel.workspace.delete', { workspaceId: 'unknown' })).rejects.toMatchObject(problem('NOT_FOUND'));

    await kernel.exec('kernel.workspace.close', { workspaceId: workspace.id });
    await kernel.exec('kernel.workspace.delete', { workspaceId: workspace.id });
    await kernel.clock.advance(0);
    await vi.waitFor(async () => expect(await kernel.exec('d.deleted-get', {})).toEqual([`${workspace.id}@home`]), reloadWait);
    expect(await kernel.exec('kernel.workspace.closed.list', {})).toEqual([]);
    await expect(kernel.exec('kernel.jobs.get', { id: queued })).rejects.toMatchObject(problem('NOT_FOUND'));
    await expect(kernel.exec('kernel.files.get', { id: file.id })).rejects.toMatchObject(problem('NOT_FOUND'));
    expect(existsSync(path.join(kernel.home, 'files', file.id))).toBe(false);
    expect(existsSync(folder)).toBe(true);
    await expect(kernel.exec('kernel.workspace.delete', { workspaceId: workspace.id })).rejects.toMatchObject(problem('NOT_FOUND'));

    const again = await kernel.exec('kernel.workspace.open', { path: folder });
    expect(again.id).not.toBe(workspace.id);
    expect(await kernel.exec('d.count-get', { key: 'old' }, { workspaceId: again.id })).toBe(0);
  });

  it('M2.4-E205 deleting a closed workspace cancels its running job and stops its process first', async () => {
    const kernel = await harness.start([owner, processOwner]);
    const workspace = await kernel.exec('kernel.workspace.open', { path: harness.temporaryFolder() });
    const at = { workspaceId: workspace.id };
    const { pid } = infoSchema.parse(await kernel.exec('p.start', { name: 'server', args: ['-e', scripts.forever] }, at));
    const held = await kernel.execAsync('d.hold', {}, at);
    await vi.waitFor(async () => expect(await kernel.exec('d.count-get', { key: 'held' }, at)).toBe(1), reloadWait);
    const ended = kernel.waitForJob(held);
    await kernel.exec('kernel.workspace.close', at);
    expect(alive(pid)).toBe(true);

    await kernel.exec('kernel.workspace.delete', at);
    expect((await ended).status).toBe('cancelled');
    expect(alive(pid)).toBe(false);
    expect(await kernel.exec('kernel.processes.list', {})).toEqual([]);
    await expect(kernel.exec('kernel.jobs.get', { id: held })).rejects.toMatchObject(problem('NOT_FOUND'));
  }, 20_000);
});
