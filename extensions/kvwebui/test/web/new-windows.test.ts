import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, ref } from 'vue';
import { custom, customApi, stack, useKvman } from './support/custom-page.ts';
import { createFakeComponents } from './support/fake-components.ts';
import { click, mountApp, type Mounted } from './support/mount-app.ts';

// A fixture component: new-window links of each kind, and a button that calls `kvman.open` and shows its answer.
const links = defineComponent({
  setup: () => {
    const kvman = useKvman();
    const opened = ref('');
    const anchor = (test: string, href: string, target?: string) => h('a', { 'data-test': test, href, ...(target === undefined ? {} : { target }) }, [h('span', { 'data-test': `${test}-text` }, test)]);
    return () =>
      h('div', [
        anchor('web', 'https://example.com/a', '_blank'),
        anchor('mail', 'mailto:a@b.c', '_blank'),
        anchor('file', 'file:///etc/hosts', '_blank'),
        anchor('same', 'https://example.com/c'),
        h('button', { 'data-test': 'open', onClick: () => (opened.value = kvman.open('https://example.com/b')) }, 'open'),
        h('output', { 'data-test': 'opened' }, opened.value),
      ]);
  },
});

async function mountLinks(path: string): Promise<Mounted> {
  const components = createFakeComponents();
  components.define('notes.links', links);
  return mountApp(customApi(stack(custom('notes.links'))), path, components);
}

const route = (path: string) => path.replace('/', '/notes/custom');

// Whether kvwebui prevented the click; the test then prevents it anyway, so happy-dom never navigates.
function press(app: Mounted, test: string, init: MouseEventInit = {}, type = 'click'): { defaultPrevented: boolean } {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, ...init });
  let prevented = false;
  const record = (seen: Event): void => {
    prevented = seen.defaultPrevented;
    seen.preventDefault();
  };
  document.addEventListener(type, record, { once: true });
  app.find(`[data-test="${test}"]`)?.dispatchEvent(event);
  return { defaultPrevented: prevented };
}

// The new windows posted to the parent; an embedded page also posts its `kvman.state` (ADR 0100, 11).
function watchParent() {
  const spy = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => undefined);
  const opened = vi.spyOn(window, 'open').mockImplementation(() => null);
  const posted = { calls: () => spy.mock.calls.filter(([message]) => typeof message === 'object' && message !== null && 'kind' in message && message.kind === 'kvman.open') };
  return { posted, opened };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('new windows in a frame (06 §6.2 and §6.4, ADR 0099, 2 and 33; ADR 0100, 9)', () => {
  it('M4.1-H3 M4.4-H7 ?embed=parent is taken once, removed from the URL, and kept for the tab', async () => {
    const { posted } = watchParent();
    const first = await mountLinks(route('/?workspace=home&embed=parent'));
    expect(first.router.currentRoute.value.fullPath).toBe('/notes/custom');
    expect(sessionStorage.getItem('kvwebui.embed')).toBe('parent');
    first.app.unmount();
    const again = await mountLinks(route('/'));
    press(again, 'web-text');
    expect(posted.calls()).toEqual([[{ kind: 'kvman.open', url: 'https://example.com/a' }, '*']]);
  });

  it('M4.1-H4 M4.4-H7 while embedded, a click and a middle click on a new-window link post it to the parent', async () => {
    const { posted, opened } = watchParent();
    const app = await mountLinks(route('/?embed=parent'));
    expect(press(app, 'web-text').defaultPrevented).toBe(true);
    expect(press(app, 'web', { button: 1 }, 'auxclick').defaultPrevented).toBe(true);
    expect(press(app, 'web', { button: 2 }, 'auxclick').defaultPrevented).toBe(false);
    expect(posted.calls()).toEqual([
      [{ kind: 'kvman.open', url: 'https://example.com/a' }, '*'],
      [{ kind: 'kvman.open', url: 'https://example.com/a' }, '*'],
    ]);
    expect(opened).not.toHaveBeenCalled();
  });

  it('M4.1-H5 M4.4-H7 kvman.open posts while embedded, and otherwise opens a tab without an opener', async () => {
    const { posted, opened } = watchParent();
    const handing = await mountLinks(route('/?embed=parent'));
    await click(handing.find('[data-test="open"]'));
    expect(handing.find('[data-test="opened"]')?.textContent).toBe('opened');
    expect(posted.calls()).toEqual([[{ kind: 'kvman.open', url: 'https://example.com/b' }, '*']]);
    expect(opened).not.toHaveBeenCalled();
    handing.app.unmount();
    sessionStorage.clear();

    const tab = { opener: {} as unknown };
    opened.mockImplementation(() => tab as Window);
    const plain = await mountLinks(route('/'));
    await click(plain.find('[data-test="open"]'));
    expect(opened.mock.calls).toEqual([['https://example.com/b', '_blank']]);
    expect(tab.opener).toBeNull();
    expect(plain.find('[data-test="opened"]')?.textContent).toBe('opened');
    opened.mockImplementation(() => null);
    await click(plain.find('[data-test="open"]'));
    expect(plain.find('[data-test="opened"]')?.textContent).toBe('blocked');
    expect(posted.calls()).toHaveLength(1);
  });

  it('M4.1-E1 a link of another scheme, or without target="_blank", posts nothing', async () => {
    const { posted } = watchParent();
    const app = await mountLinks(route('/?embed=parent'));
    for (const test of ['mail', 'file', 'same']) expect(press(app, test).defaultPrevented, test).toBe(false);
    expect(posted.calls()).toEqual([]);
  });

  it('M4.1-E2 without ?embed=parent a new-window link is left to the browser', async () => {
    const { posted } = watchParent();
    const app = await mountLinks(route('/'));
    expect(press(app, 'web-text').defaultPrevented).toBe(false);
    expect(posted.calls()).toEqual([]);
    expect(sessionStorage.getItem('kvwebui.embed')).toBeNull();
  });

  it('M4.1-E3 another ?embed value is no handoff and stays in the URL', async () => {
    const { posted } = watchParent();
    const app = await mountLinks(route('/?embed=tab'));
    expect(app.router.currentRoute.value.fullPath).toBe('/notes/custom?embed=tab');
    expect(sessionStorage.getItem('kvwebui.embed')).toBeNull();
    press(app, 'web-text');
    expect(posted.calls()).toEqual([]);
  });

  it('M4.1-E4 the catch ends when the app is unmounted', async () => {
    const { posted } = watchParent();
    const app = await mountLinks(route('/?embed=parent'));
    const link = app.find('[data-test="web"]')?.cloneNode(true);
    app.app.unmount();
    if (link === undefined) throw new Error('The link was not shown.');
    document.body.append(link);
    document.addEventListener('click', (event) => event.preventDefault(), { once: true });
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(posted.calls()).toEqual([]);
  });
});
