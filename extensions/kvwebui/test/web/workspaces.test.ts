import type { Json } from '@kvman/sdk';
import { describe, expect, it } from 'vitest';
import { fail } from './support/fake-api.ts';
import { click, mountApp, type, type Mounted } from './support/mount-app.ts';
import { notesApi, notesUi } from './support/notes.ts';

function withWorkspaces(): ReturnType<typeof notesApi> {
  const api = notesApi();
  api.workspaces.push({ id: 'w1', name: 'project', path: '/work/project' }, { id: 'w2', name: 'second', path: '/work/second' });
  api.handlers.set('kernel.folder.list', (input: Json) => {
    const path = (input as { path?: string }).path ?? '/home/me';
    return { path, parent: '/', folders: [], truncated: false };
  });
  api.handlers.set('kernel.workspace.open', (input: Json) => {
    const workspace = { id: 'w3', name: 'other', path: String((input as { path: string }).path) };
    api.workspaces.push(workspace);
    return workspace;
  });
  return api;
}

const openPicker = (app: Mounted) => click(app.find('button[aria-label^="Workspace:"]'));

describe('workspaces in the browser (06 §6.2, ADR 0009, 74)', () => {
  it("M2.2-H5 opening /?workspace=<id> sets the tab's workspace and drops the parameter", async () => {
    const api = withWorkspaces();
    const app = await mountApp(api, '/?workspace=w1');
    expect(app.router.currentRoute.value.fullPath).toBe('/');
    expect(app.find('[data-test="workspace-current"]')?.textContent).toBe('project');
    expect(new Set(api.calls.slice(1).map((call) => call.workspaceId))).toEqual(new Set(['w1']));
    expect([sessionStorage.getItem('kvwebui.workspace'), localStorage.getItem('kvwebui.workspace')]).toEqual(['w1', 'w1']);
  });

  it('M2.2-E5 the picker opens and closes workspaces; reloads, new tabs, and closed workspaces land where they should', async () => {
    const api = withWorkspaces();
    const app = await mountApp(api, '/notes/list');
    await openPicker(app);
    expect(app.find('[data-test="workspace-home"]')?.textContent).toContain('Home');
    expect(app.find('[data-test="close-home"]')).toBeNull();
    expect(app.find('[data-test="workspace-w1"]')?.textContent).toContain('/work/project');
    expect(app.find('[data-test="close-w1"]')).not.toBeNull();
    expect(app.find('[data-test="close-w2"]')).not.toBeNull();
    await click(app.find('[data-test="open-folder"]'));
    await type(document.querySelector<HTMLElement>('[data-test="folder-path"]'), '/work/other');
    document.querySelector('[data-test="folder-path"]')?.closest('form')?.dispatchEvent(new Event('submit', { cancelable: true }));
    await app.settle();
    await click(document.querySelector<HTMLElement>('[data-test="folder-open"]'));
    expect(api.callsTo('kernel.workspace.open').map((call) => call.input)).toEqual([{ path: '/work/other' }]);
    expect(app.state.workspace.value).toBe('w3');

    expect((await mountApp(api, '/')).state.workspace.value).toBe('w3');
    sessionStorage.clear();
    expect((await mountApp(api, '/')).state.workspace.value).toBe('w3');
    expect((await mountApp(api, '/?workspace=gone')).state.workspace.value).toBe('home');

    await openPicker(app);
    await click(app.find('[data-test="close-w3"]'));
    expect(api.callsTo('kernel.workspace.close').map((call) => call.input)).toEqual([{ workspaceId: 'w3' }]);
    expect(app.state.workspace.value).toBe('home');

    await click(app.find('[data-test="workspace-w2"]'));
    expect(app.state.workspace.value).toBe('w2');
    api.workspaces = api.workspaces.filter((workspace) => workspace.id !== 'w2');
    await app.router.push('/kvwebui/extension/notes');
    await app.settle();
    expect(app.state.workspace.value).toBe('home');
    expect(app.find('[data-level="warning"]')?.textContent).toContain('The workspace second was closed, so this tab moved to Home.');
  });

  it('M2.2-E6 one panel is open at a time, on every page, and the tab remembers it', async () => {
    const tips = { id: 'tips', title: 'notes.pages.note', icon: 'lightbulb', view: { type: 'text', text: 'notes.done' } };
    const help = { id: 'help', title: 'notes.panels.help', icon: 'circle-question-mark', view: { type: 'text', text: 'notes.help.body' } };
    const api = notesApi({ ui: notesUi({ panels: [help, tips] }) });
    const app = await mountApp(api, '/notes/list');
    await click(app.find('[data-test="panel-button-notes.help"]'));
    await click(app.find('[data-test="panel-button-notes.tips"]'));
    expect(app.findAll('[data-test^="panel-notes."]').map((panel) => panel.dataset['test'])).toEqual(['panel-notes.tips']);
    await app.router.push('/kvwebui/settings');
    await app.settle();
    expect(app.find('[data-test="panel-notes.tips"]')).not.toBeNull();
    const again = await mountApp(api, '/notes/list');
    expect(again.find('[data-test="panel-notes.tips"]')).not.toBeNull();
    await click(again.find('[data-test="panel-button-notes.tips"]'));
    expect(again.find('[data-test="panel-notes.tips"]')).toBeNull();
  });

  it('QA2-E1 a folder the kernel refuses shows its reason in the dialog', async () => {
    const api = withWorkspaces();
    api.handlers.set('kernel.workspace.open', () => fail('VALIDATION_FAILED', { path: 'relative/nope' }));
    const app = await mountApp(api, '/notes/list');
    await openPicker(app);
    await click(app.find('[data-test="open-folder"]'));
    await type(document.querySelector<HTMLElement>('[data-test="folder-path"]'), 'relative/nope');
    await click(document.querySelector<HTMLElement>('[data-test="folder-open"]'));
    expect(document.querySelector('[data-test="folder-issue"]')?.textContent).toBe('VALIDATION_FAILED happened.');
  });
});
