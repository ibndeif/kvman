import type { Json } from '@kvman/sdk';
import { describe, expect, it } from 'vitest';
import { click, mountApp, type Mounted } from './support/mount-app.ts';
import { notesApi } from './support/notes.ts';

const openPicker = (app: Mounted) => click(app.find('button[aria-label^="Workspace:"]'));

function withClosed(): ReturnType<typeof notesApi> {
  const api = notesApi();
  api.closedWorkspaces = [
    { id: 'c1', name: 'site', path: '/work/site', missing: false },
    { id: 'c2', name: 'gone', path: '/tmp/gone', missing: true },
    { id: 'c3', name: 'lost', path: '/tmp/lost', missing: true },
  ];
  api.handlers.set('kernel.workspace.open', (input: Json) => {
    const path = String((input as { path: string }).path);
    const found = api.closedWorkspaces.find((workspace) => workspace.path === path);
    const workspace = { id: found?.id ?? 'new', name: found?.name ?? 'new', path };
    api.closedWorkspaces = api.closedWorkspaces.filter((closed) => closed.path !== path);
    api.workspaces.push(workspace);
    return workspace;
  });
  return api;
}

const deleted = (api: ReturnType<typeof notesApi>) => api.callsTo('kernel.workspace.delete').map((call) => call.input);

describe('closed workspaces in the picker (06 §6.2, ADR 0061, 5)', () => {
  it('M2.4-E208 the section shows only when a workspace is closed, folds with its count, and marks a missing folder, which has no Reopen', async () => {
    const none = await mountApp(notesApi(), '/notes/list');
    await openPicker(none);
    expect(none.find('[data-test="closed-workspaces"]')).toBeNull();

    const app = await mountApp(withClosed(), '/notes/list');
    await openPicker(app);
    expect(app.find('[data-test="closed-toggle"]')?.textContent.trim()).toBe('Closed workspaces (3)');
    expect(app.find('[data-test="closed-c1"]')).toBeNull();
    await click(app.find('[data-test="closed-toggle"]'));
    expect(app.find('[data-test="closed-c1"]')?.textContent).toContain('/work/site');
    expect(app.find('[data-test="missing-c1"]')).toBeNull();
    expect(app.find('[data-test="missing-c2"]')?.textContent).toBe('folder missing');
    expect(app.find('[data-test="reopen-c1"]')).not.toBeNull();
    expect(app.find('[data-test="reopen-c2"]')).toBeNull();
  });

  it('M2.4-E208 Delete asks first and then deletes one; Delete all missing deletes each missing one; Reopen opens the folder', async () => {
    const api = withClosed();
    const app = await mountApp(api, '/notes/list');
    await openPicker(app);
    await click(app.find('[data-test="closed-toggle"]'));

    await click(app.find('[data-test="delete-c1"]'));
    expect(deleted(api)).toEqual([]);
    expect(app.find('[data-test="confirm-c1"]')?.textContent).toContain("Delete this workspace's data? Its folder is not touched.");
    await click(app.find('[data-test="delete-missing"]'));
    expect(app.find('[data-test="confirm-c1"]')).toBeNull();
    await click(app.find('[data-test="confirm-delete-missing"]'));
    expect(deleted(api)).toEqual([{ workspaceId: 'c2' }, { workspaceId: 'c3' }]);
    expect(app.find('[data-test="closed-toggle"]')?.textContent.trim()).toBe('Closed workspaces (1)');
    expect(app.find('[data-test="delete-missing"]')).toBeNull();

    await click(app.find('[data-test="reopen-c1"]'));
    expect(api.callsTo('kernel.workspace.open').map((call) => call.input)).toEqual([{ path: '/work/site' }]);
    expect(app.state.workspace.value).toBe('c1');
    expect(app.find('[data-test="closed-workspaces"]')).toBeNull();
  });

  it('M2.4-E208 a confirmed Delete of one workspace runs the command for it alone', async () => {
    const api = withClosed();
    const app = await mountApp(api, '/notes/list');
    await openPicker(app);
    await click(app.find('[data-test="closed-toggle"]'));
    await click(app.find('[data-test="delete-c1"]'));
    await click(app.find('[data-test="confirm-delete-c1"]'));
    expect(deleted(api)).toEqual([{ workspaceId: 'c1' }]);
    expect(app.find('[data-test="closed-c1"]')).toBeNull();
    expect(app.find('[data-test="closed-c2"]')).not.toBeNull();
  });
});
