import { mkdirSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { entry, gateEntry, openGate, useHarness } from '../extension-folders.ts';

const harness = useHarness();

const notes = {
  name: '@test/ws',
  namespace: 'ws',
  entry: entry(`${gateEntry}
  ctx.registerCommand('ws.note-set', { description: 'Stores a note.', input: z.object({ note: z.string() }), output: z.object({}), public: true,
    handle: async (input) => { await ctx.store.kv.set('note', input.note); return {}; } });
  ctx.registerQuery('ws.note-get', { description: 'Reads the note.', input: z.object({}), output: z.unknown(), public: true,
    handle: async () => (await ctx.store.kv.get('note')) ?? null });
  ctx.registerCommand('ws.hold', { description: 'Waits for the test.', input: z.object({}), output: z.object({}), public: true,
    handle: async () => { await gate('m16-ws-hold'); return {}; } });`),
};

const problem = (code: string) => ({ problem: { code } });

describe('workspaces (02 §2.6)', () => {
  it('M1.6-H1 workspaces open, list, close, and reopen with their data; Home cannot be closed', async () => {
    const kernel = await harness.start([notes]);
    const first = harness.temporaryFolder();
    const second = harness.temporaryFolder();
    const a = await kernel.exec('kernel.workspace.open', { path: first });
    const b = await kernel.exec('kernel.workspace.open', { path: second });
    expect(a).toMatchObject({ name: path.basename(first), path: realpathSync(first) });
    expect(await kernel.exec('kernel.workspace.open', { path: first })).toEqual(a);
    const home = { id: 'home', name: path.basename(kernel.homeFolder), path: kernel.homeFolder };
    expect(await kernel.exec('kernel.workspace.list', {})).toEqual([home, a, b]);
    await kernel.exec('ws.note-set', { note: 'kept' }, { workspaceId: a.id });
    await kernel.exec('kernel.workspace.close', { workspaceId: a.id });
    expect(await kernel.exec('kernel.workspace.list', {})).toEqual([home, b]);
    expect(await kernel.exec('kernel.workspace.open', { path: first })).toEqual(a);
    expect(await kernel.exec('kernel.workspace.list', {})).toEqual([home, a, b]);
    expect(await kernel.exec('ws.note-get', {}, { workspaceId: a.id })).toBe('kept');
    await expect(kernel.exec('kernel.workspace.close', { workspaceId: 'home' })).rejects.toMatchObject(problem('VALIDATION_FAILED'));
  });

  it('M1.6-E1 a relative path, a missing folder, and a file fail VALIDATION_FAILED', async () => {
    const kernel = await harness.start([notes]);
    const folder = harness.temporaryFolder();
    writeFileSync(path.join(folder, 'file.txt'), 'x');
    for (const candidate of ['relative/folder', path.join(folder, 'missing'), path.join(folder, 'file.txt')]) {
      await expect(kernel.exec('kernel.workspace.open', { path: candidate })).rejects.toMatchObject(problem('VALIDATION_FAILED'));
    }
  });

  it('M1.6-E2 a symlink and a trailing slash reopen the same workspace, and Home\'s folder answers Home', async () => {
    const kernel = await harness.start([notes]);
    const folder = path.join(harness.temporaryFolder(), 'project');
    mkdirSync(folder);
    const link = path.join(harness.temporaryFolder(), 'link');
    symlinkSync(folder, link);
    const opened = await kernel.exec('kernel.workspace.open', { path: folder });
    expect(opened.name).toBe('project');
    expect(await kernel.exec('kernel.workspace.open', { path: link })).toEqual(opened);
    expect(await kernel.exec('kernel.workspace.open', { path: `${folder}${path.sep}` })).toEqual(opened);
    expect(await kernel.exec('kernel.workspace.open', { path: kernel.homeFolder })).toMatchObject({ id: 'home' });
  });

  it('M1.6-E3 a closed workspace is NOT_FOUND to calls, and a job running in it still finishes', async () => {
    const kernel = await harness.start([notes]);
    const closed = await kernel.exec('kernel.workspace.open', { path: harness.temporaryFolder() });
    const running = await kernel.exec('kernel.workspace.open', { path: harness.temporaryFolder() });
    await kernel.exec('kernel.workspace.close', { workspaceId: closed.id });
    await expect(kernel.exec('kernel.workspace.close', { workspaceId: closed.id })).rejects.toMatchObject(problem('NOT_FOUND'));
    await expect(kernel.exec('ws.note-get', {}, { workspaceId: closed.id })).rejects.toMatchObject(problem('NOT_FOUND'));
    await expect(kernel.execAsync('ws.note-set', { note: 'x' }, { workspaceId: closed.id })).rejects.toMatchObject(problem('NOT_FOUND'));
    const gate = openGate('m16-ws-hold');
    const jobId = await kernel.execAsync('ws.hold', {}, { workspaceId: running.id });
    await gate.waiting;
    await kernel.exec('kernel.workspace.close', { workspaceId: running.id });
    gate.release();
    expect(await kernel.waitForJob(jobId)).toMatchObject({ status: 'succeeded', workspaceId: running.id });
  });
});
