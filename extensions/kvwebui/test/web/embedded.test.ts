import { afterEach, describe, expect, it, vi } from 'vitest';
import { switchWorkspace } from '../../web/src/state/workspaces.ts';
import { mountApp, type Mounted } from './support/mount-app.ts';
import { notesApi } from './support/notes.ts';

// kvwebui embedded in a host (06 §6.2, ADR 0100, 9 to 11). In happy-dom the parent is the window itself.

function withWorkspaces() {
  const api = notesApi();
  api.workspaces.push({ id: 'w1', name: 'project', path: '/work/project' }, { id: 'w2', name: 'second', path: '/work/second' });
  return api;
}

const frameParts = (app: Mounted) => ({
  topBar: app.root.querySelector('header') !== null,
  nav: app.find('[data-test="nav"]') !== null,
  panels: app.find('[data-test="panel-strip"]') !== null,
  status: app.find('[data-test="status-bar"]') !== null,
  picker: app.find('button[aria-label^="Workspace:"]') !== null,
});

const states = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.filter(([message]) => typeof message === 'object' && message !== null && 'kind' in message && message.kind === 'kvman.state');

afterEach(() => {
  vi.restoreAllMocks();
});

describe('kvwebui embedded in a host (06 §6.2, ADR 0100, 9 to 11)', () => {
  it('M4.4-H1 ?embed=parent is taken once, kept for the tab, and shows the page without a frame', async () => {
    const api = withWorkspaces();
    const first = await mountApp(api, '/notes/list?workspace=w1&embed=parent');
    expect(first.router.currentRoute.value.fullPath).toBe('/notes/list');
    expect(sessionStorage.getItem('kvwebui.embed')).toBe('parent');
    expect(first.find('[data-test="embedded"]')).not.toBeNull();
    expect(frameParts(first)).toEqual({ topBar: false, nav: false, panels: false, status: false, picker: false });
    expect(first.text()).toContain('Notes');
    first.app.unmount();
    const again = await mountApp(api, '/notes/list');
    expect(again.find('[data-test="embedded"]')).not.toBeNull();
    sessionStorage.clear();
    again.app.unmount();
    const plain = await mountApp(api, '/notes/list');
    expect(plain.find('[data-test="embedded"]')).toBeNull();
    expect(frameParts(plain)).toMatchObject({ topBar: true, nav: true, status: true, picker: true });
  });

  it('M4.4-H2 the embedded page says its workspace once booted and after a switch', async () => {
    const spy = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => undefined);
    const app = await mountApp(withWorkspaces(), '/?workspace=w1&embed=parent');
    expect(states(spy)).toEqual([[{ kind: 'kvman.state', workspaceId: 'w1' }, '*']]);
    await switchWorkspace(app.state, 'w2');
    await app.settle();
    expect(states(spy)).toEqual([[{ kind: 'kvman.state', workspaceId: 'w1' }, '*'], [{ kind: 'kvman.state', workspaceId: 'w2' }, '*']]);
  });

  it('M4.4-E1 a page that is not embedded posts no state', async () => {
    const spy = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => undefined);
    const app = await mountApp(withWorkspaces(), '/?workspace=w1');
    await switchWorkspace(app.state, 'w2');
    expect(spy).not.toHaveBeenCalled();
  });

  it('M4.4-E3 the old ?open=parent is no handoff and stays in the URL', async () => {
    const app = await mountApp(withWorkspaces(), '/notes/list?open=parent');
    expect(app.router.currentRoute.value.fullPath).toBe('/notes/list?open=parent');
    expect(app.find('[data-test="embedded"]')).toBeNull();
    expect(sessionStorage.getItem('kvwebui.embed')).toBeNull();
  });
});
