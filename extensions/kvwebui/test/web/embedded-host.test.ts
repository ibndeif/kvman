import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, onBeforeUnmount, ref } from 'vue';
import { custom, customApi, stack, useKvman } from './support/custom-page.ts';
import { createFakeComponents } from './support/fake-components.ts';
import { click, mountApp, type Mounted } from './support/mount-app.ts';
import { notesUi } from './support/notes.ts';

// What an embedded page asks of its host, and takes from it (06 §6.2 and §6.4, ADR 0100, 11 to 14). In happy-dom the
// parent is the window itself, so a message "from the host" is one whose source is `window`.

const hostUser = defineComponent({
  setup: () => {
    const kvman = useKvman();
    const inserted = ref('');
    const removeFirst = kvman.host.onInsert((text) => (inserted.value = text));
    const removed = vi.fn();
    kvman.host.onInsert(removed)();
    onBeforeUnmount(removeFirst);
    const opens = () => {
      kvman.host.openFile('/w/a.ts', 12);
      kvman.host.openFile('/w/b.ts');
      kvman.host.openDiff('a.ts (proposed)', '/w/a.ts', 'x');
      kvman.host.openChange('/w/a.ts');
    };
    return () =>
      h('div', [
        h('button', { 'data-test': 'opens', onClick: opens }, 'opens'),
        h('output', { 'data-test': 'is-embedded' }, String(kvman.host.embedded)),
        h('output', { 'data-test': 'inserted' }, inserted.value),
        h('output', { 'data-test': 'removed' }, String(removed.mock.calls.length)),
      ]);
  },
});

async function mountHostUser(path: string): Promise<Mounted> {
  const components = createFakeComponents();
  components.define('notes.host', hostUser);
  const api = customApi(stack(custom('notes.host')));
  const page = { id: 'custom', title: 'notes.pages.list', view: stack(custom('notes.host')) };
  api.handlers.set('notes.ui.get', () => notesUi({ pages: [page], nav: [{ id: 'list', page: 'custom', title: 'notes.pages.list', icon: 'notebook', order: 10 }] }));
  return mountApp(api, path, components);
}

const theme = {
  kind: 'kvman.theme',
  dark: true,
  colors: { background: '#1e1e1e', surface: '#252526', text: '#cccccc', muted: '#9d9d9d', border: '#3c3c3c', primary: '#0e639c', onPrimary: '#ffffff', danger: '#f48771', warning: '#cca700', success: '#89d185' },
  fonts: { sans: 'Ubuntu', mono: 'Fira Code', size: '13px' },
};

async function fromHost(app: Mounted, data: unknown, source: Window | null = window.parent): Promise<void> {
  window.dispatchEvent(new MessageEvent('message', { data, source }));
  await app.settle();
}

const rootVariable = (name: string): string => document.documentElement.style.getPropertyValue(name);
const hostCalls = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.map(([message]) => message).filter((message) => typeof message === 'object' && message !== null && 'kind' in message && message.kind !== 'kvman.state');

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.removeAttribute('style');
});

describe("an embedded page and its host (06 §6.2 and §6.4, ADR 0100, 11 to 14)", () => {
  it('M4.4-H3 kvman.host posts the opens while embedded', async () => {
    const spy = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => undefined);
    const app = await mountHostUser('/notes/custom?embed=parent');
    expect(app.find('[data-test="is-embedded"]')?.textContent).toBe('true');
    await click(app.find('[data-test="opens"]'));
    expect(hostCalls(spy)).toEqual([
      { kind: 'kvman.openFile', path: '/w/a.ts', line: 12 },
      { kind: 'kvman.openFile', path: '/w/b.ts' },
      { kind: 'kvman.openDiff', title: 'a.ts (proposed)', path: '/w/a.ts', after: 'x' },
      { kind: 'kvman.openChange', path: '/w/a.ts' },
    ]);
  });

  it("M4.4-H4 the host's theme sets kvwebui's colors, dark, fonts, and size, and kvwebui's own theme doesn't undo it", async () => {
    const app = await mountHostUser('/notes/custom?embed=parent');
    await fromHost(app, theme);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect([rootVariable('--kvwebui-ground'), rootVariable('--kvwebui-surface'), rootVariable('--kvwebui-ink'), rootVariable('--kvwebui-primary')]).toEqual(['#1e1e1e', '#252526', '#cccccc', '#0e639c']);
    expect(rootVariable('--kvwebui-accent-soft')).toBe('color-mix(in srgb, #0e639c 18%, #252526)');
    expect([rootVariable('--kvwebui-font-sans'), rootVariable('--kvwebui-font-mono'), document.documentElement.style.fontSize]).toEqual(['Ubuntu', 'Fira Code', '13px']);
    window.matchMedia('(prefers-color-scheme: dark)').dispatchEvent(new Event('change'));
    await fromHost(app, { ...theme, dark: false });
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('M4.4-H5 kvman.pages opens the pages menu; a pick, Escape, and a press outside close it', async () => {
    const app = await mountHostUser('/notes/custom?embed=parent');
    expect(app.find('[data-test="pages-menu"]')).toBeNull();
    await fromHost(app, { kind: 'kvman.pages' });
    expect(app.findAll('[data-test="pages-menu"] a').map((link) => link.dataset['test'])).toEqual(['pages-notes.list', 'pages-kvwebui.settings', 'pages-kvwebui.extensions']);
    await click(app.find('[data-test="pages-kvwebui.settings"]'));
    expect(app.router.currentRoute.value.path).toBe('/kvwebui/settings');
    expect(app.find('[data-test="pages-menu"]')).toBeNull();
    await fromHost(app, { kind: 'kvman.pages' });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await app.settle();
    expect(app.find('[data-test="pages-menu"]')).toBeNull();
    await fromHost(app, { kind: 'kvman.pages' });
    await click(app.find('[data-test="pages-backdrop"]'));
    expect(app.find('[data-test="pages-menu"]')).toBeNull();
  });

  it('M4.4-H6 kvman.insert reaches each handler, and a removed handler gets nothing', async () => {
    const app = await mountHostUser('/notes/custom?embed=parent');
    await fromHost(app, { kind: 'kvman.insert', text: 'hello' });
    expect(app.find('[data-test="inserted"]')?.textContent).toBe('hello');
    expect(app.find('[data-test="removed"]')?.textContent).toBe('0');
  });

  it('M4.4-E1 a page that is not embedded posts nothing and takes nothing', async () => {
    const spy = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => undefined);
    const app = await mountHostUser('/notes/custom');
    expect(app.find('[data-test="is-embedded"]')?.textContent).toBe('false');
    await click(app.find('[data-test="opens"]'));
    await fromHost(app, theme);
    await fromHost(app, { kind: 'kvman.pages' });
    await fromHost(app, { kind: 'kvman.insert', text: 'hello' });
    expect(spy).not.toHaveBeenCalled();
    expect(rootVariable('--kvwebui-ground')).toBe('');
    expect(app.find('[data-test="pages-menu"]')).toBeNull();
    expect(app.find('[data-test="inserted"]')?.textContent).toBe('');
  });

  it('M4.4-E2 a message from another window, or of another shape, changes nothing', async () => {
    const app = await mountHostUser('/notes/custom?embed=parent');
    const other = document.createElement('iframe');
    document.body.append(other);
    await fromHost(app, theme, other.contentWindow);
    await fromHost(app, { ...theme, colors: { ...theme.colors, surface: undefined } });
    await fromHost(app, { kind: 'kvman.insert' });
    await fromHost(app, { kind: 'kvman.unknown', text: 'x' });
    await fromHost(app, 'kvman.pages');
    expect(rootVariable('--kvwebui-ground')).toBe('');
    expect(app.find('[data-test="inserted"]')?.textContent).toBe('');
    expect(app.find('[data-test="pages-menu"]')).toBeNull();
  });

  it("M4.4-E4 the host's listener ends with the app", async () => {
    const app = await mountHostUser('/notes/custom?embed=parent');
    const inserts = app.state.host.inserts;
    const handler = vi.fn();
    inserts.add(handler);
    app.app.unmount();
    window.dispatchEvent(new MessageEvent('message', { data: { kind: 'kvman.insert', text: 'late' }, source: window.parent }));
    expect(handler).not.toHaveBeenCalled();
  });
});
