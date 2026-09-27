import { createHash } from 'node:crypto';
import { mkdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { workspaceA } from '../hosts/harness.ts';
import { command, extensionActor, problemOf, type InstallFixture } from '../install/harness.ts';
import { admission, enable, eventsOf, openFolderAsWorkspace, openWorkspaceFixture, query, rows, run, temporaryFolder, valueOf, workspaceTests } from './harness.ts';

let fixture: InstallFixture | undefined;

afterEach(async () => {
  await fixture?.close();
  fixture = undefined;
});

async function opened(): Promise<InstallFixture> {
  fixture = await openWorkspaceFixture();
  return fixture;
}

function idOf(path: string): string {
  return createHash('sha256').update(realpathSync.native(path), 'utf8').digest('hex');
}

function openFolder(current: InstallFixture, path: string): Promise<string> {
  return openFolderAsWorkspace(current, path);
}

describe('opening and naming workspaces (plan 07 §7.1, ADR 0127)', workspaceTests, () => {
  it('M2.3-E1 a folder opened twice, once through a symlink, is one workspace named after the folder', async () => {
    const current = await opened();
    const parent = temporaryFolder('open');
    const folder = join(parent, 'Research');
    mkdirSync(folder);
    symlinkSync(folder, join(parent, 'link'));
    const first = await openFolder(current, folder);
    expect(first).toBe(idOf(folder));
    expect(rows(current, 'SELECT path, name FROM workspaces WHERE id = ?', first)).toEqual([{ path: realpathSync.native(folder), name: 'Research' }]);
    expect(await openFolder(current, join(parent, 'link'))).toBe(first);
    expect(rows(current, 'SELECT COUNT(*) AS count FROM workspaces WHERE id = ?', first)).toEqual([{ count: 1 }]);
    expect(eventsOf(current, 'kernel.workspace.opened')).toEqual([{ workspaceId: null, payload: { workspaceId: first } }, { workspaceId: null, payload: { workspaceId: first } }]);
  });

  it('M2.3-E2 a relative path, a missing path, a file, and the kvman home folder are refused', async () => {
    const current = await opened();
    const before = rows(current, 'SELECT id FROM workspaces');
    const file = join(temporaryFolder('file'), 'notes.txt');
    writeFileSync(file, 'x');
    expect(problemOf(await run(current, 'kernel.workspace.open', { path: 'relative/folder' }))).toMatchObject({ code: 'VALIDATION_FAILED' });
    for (const path of [join(temporaryFolder('missing'), 'none'), file, current.home, join(current.home, 'extensions')]) {
      expect(problemOf(await run(current, 'kernel.workspace.open', { path }))).toMatchObject({ code: 'WORKSPACE_INVALID' });
    }
    expect(rows(current, 'SELECT id FROM workspaces')).toEqual(before);
  });

  it('M2.3-E3 a rename is trimmed and announced; empty, blank, and long names and unknown workspaces are refused', async () => {
    const current = await opened();
    expect(await run(current, 'kernel.workspace.rename', { workspaceId: workspaceA, name: '  Research  ' })).toEqual({ ok: true, value: {} });
    expect(rows(current, 'SELECT name FROM workspaces WHERE id = ?', workspaceA)).toEqual([{ name: 'Research' }]);
    expect(eventsOf(current, 'kernel.workspace.renamed')).toEqual([{ workspaceId: null, payload: { workspaceId: workspaceA } }]);
    expect(await admission(current, 'kernel.workspace.rename', { workspaceId: workspaceA, name: '' })).toBe('VALIDATION_FAILED');
    expect(await admission(current, 'kernel.workspace.rename', { workspaceId: workspaceA, name: 'x'.repeat(101) })).toBe('VALIDATION_FAILED');
    expect(problemOf(await run(current, 'kernel.workspace.rename', { workspaceId: workspaceA, name: '   ' }))).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(problemOf(await run(current, 'kernel.workspace.rename', { workspaceId: 'c'.repeat(64), name: 'Other' }))).toMatchObject({ code: 'WORKSPACE_INVALID' });
  });

  it('M2.3-E4 kernel.workspaces.list sorts by name then path and marks missing folders; kernel.workspace.get', async () => {
    const current = await opened();
    const parent = temporaryFolder('list');
    const openedFolders: Array<{ workspaceId: string; path: string; name: string }> = [];
    for (const [folder, name] of [['one', 'beta'], ['two', 'alpha'], ['three', 'alpha']] as const) {
      mkdirSync(join(parent, folder));
      const workspaceId = await openFolder(current, join(parent, folder));
      valueOf(await run(current, 'kernel.workspace.rename', { workspaceId, name }));
      openedFolders.push({ workspaceId, path: realpathSync.native(join(parent, folder)), name });
    }
    rmSync(join(parent, 'two'), { recursive: true });
    const listed = await query(current, 'kernel.workspaces.list', {});
    const three = openedFolders.find((entry) => entry.path.endsWith('three'));
    const two = openedFolders.find((entry) => entry.path.endsWith('two'));
    const one = openedFolders.find((entry) => entry.path.endsWith('one'));
    expect(listed).toEqual({
      ok: true,
      value: [
        { id: workspaceA, path: '/w/a', name: 'A', kind: 'normal', trusted: false, exists: false },
        { id: 'b'.repeat(64), path: '/w/b', name: 'B', kind: 'normal', trusted: false, exists: false },
        { id: three?.workspaceId, path: three?.path, name: 'alpha', kind: 'normal', trusted: false, exists: true },
        { id: two?.workspaceId, path: two?.path, name: 'alpha', kind: 'normal', trusted: false, exists: false },
        { id: one?.workspaceId, path: one?.path, name: 'beta', kind: 'normal', trusted: false, exists: true },
      ],
    });
    expect(await query(current, 'kernel.workspace.get', { workspaceId: one?.workspaceId ?? '' })).toEqual({
      ok: true, value: { id: one?.workspaceId, path: one?.path, name: 'beta', kind: 'normal', trust: null, repoPreset: false },
    });
    expect(await query(current, 'kernel.workspace.get', { workspaceId: 'c'.repeat(64) })).toMatchObject({ ok: false, problem: { code: 'WORKSPACE_INVALID' } });
  });

  it('M2.3-E5 open and rename are admin; forget is for people', async () => {
    const current = await opened();
    valueOf(await enable(current, workspaceA, '@acme/desk'));
    valueOf(await enable(current, workspaceA, '@acme/steward'));
    const path = temporaryFolder('admin');
    expect(await run(current, 'desk.call', { type: 'kernel.workspace.open', payload: { path } })).toEqual({ ok: true, value: { code: 'CAPABILITY_DENIED' } });
    expect(await run(current, 'desk.call', { type: 'kernel.workspace.rename', payload: { workspaceId: workspaceA, name: 'X' } })).toEqual({ ok: true, value: { code: 'CAPABILITY_DENIED' } });
    expect(await run(current, 'steward.call', { type: 'kernel.workspace.open', payload: { path } })).toEqual({ ok: true, value: { result: { workspaceId: idOf(path) } } });
    expect(await run(current, 'steward.call', { type: 'kernel.workspace.rename', payload: { workspaceId: workspaceA, name: 'X' } })).toEqual({ ok: true, value: { result: {} } });
    expect(await admission(current, 'kernel.workspace.forget', { workspaceId: idOf(path) }, extensionActor('@acme/steward'))).toBe('admitted');
    expect(problemOf(await command(current, 'kernel.workspace.forget', { workspaceId: idOf(path) }, extensionActor('@acme/steward')))).toMatchObject({ code: 'CALLER_NOT_ALLOWED' });
  });

  it('M2.3-E6 a command or query for a workspace without a row is refused at admission', async () => {
    const current = await opened();
    const unknown = 'c'.repeat(64);
    expect(await admission(current, 'kernel.cancel', { messageId: '01JAZ3K4M5N6P7Q8R9S0T1V2W3' }, undefined, unknown)).toBe('WORKSPACE_INVALID');
    expect(await query(current, 'kernel.health.get', {}, undefined, unknown)).toMatchObject({ ok: false, problem: { code: 'WORKSPACE_INVALID' } });
    expect(rows(current, 'SELECT id FROM messages WHERE workspace_id = ?', unknown)).toEqual([]);
  });
});
