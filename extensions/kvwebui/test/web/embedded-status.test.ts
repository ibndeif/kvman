import { afterEach, describe, expect, it, vi } from 'vitest';
import { click, mountApp, type Mounted } from './support/mount-app.ts';
import { notesApi, notesUi } from './support/notes.ts';

// The embedded status line, and kvman not answering while embedded (06 §6.2, ADR 0101, 2 and 3). In happy-dom the
// parent is the window itself.

afterEach(() => {
  vi.restoreAllMocks();
});

const lostPosts = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.filter(([message]) => typeof message === 'object' && message !== null && 'kind' in message && message.kind === 'kvman.lost').length;
const call = (app: Mounted) => app.state.api.query('notes.count.get', {}).then(() => 'reached', () => 'not answered');
const toasts = (app: Mounted) => app.findAll('[role="status"][data-level]').map((toast) => toast.textContent);

async function pickArabicInMenu(app: Mounted): Promise<void> {
  window.dispatchEvent(new MessageEvent('message', { data: { kind: 'kvman.pages' }, source: window.parent }));
  await app.settle();
  await click(app.find('[data-test="pages-language"]'));
  await click(app.find('[data-test="pages-language-ar"]'));
}

describe('the embedded status line (06 §6.2, ADR 0101, 2 and 3)', () => {
  it('M4.7-H10 the status line shows the contributed items, without the workspace folder', async () => {
    const app = await mountApp(notesApi(), '/notes/list?embed=parent');
    const line = app.find('[data-test="status-line"]');
    expect(line?.textContent).toBe('3 notes');
    expect(app.find('[data-test="status-workspace"]')).toBeNull();
    expect(app.find('[data-test="status-bar"]')).toBeNull();
  });

  it("M4.7-H11 kvman not answering posts kvman.lost once until a call reaches it, shows no toast, and the line says it's reconnecting", async () => {
    const spy = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => undefined);
    const api = notesApi();
    const app = await mountApp(api, '/notes/list?embed=parent');
    api.offline = true;
    expect([await call(app), await call(app)]).toEqual(['not answered', 'not answered']);
    await app.settle();
    expect(lostPosts(spy)).toBe(1);
    expect(app.find('[data-test="reconnecting"]')?.textContent).toBe("kvman doesn't answer. Reconnecting…");
    await pickArabicInMenu(app);
    expect(toasts(app)).toEqual([]);
    api.offline = false;
    expect(await call(app)).toBe('reached');
    await app.settle();
    expect(app.find('[data-test="reconnecting"]')).toBeNull();
    api.offline = true;
    await call(app);
    await app.settle();
    expect(lostPosts(spy)).toBe(2);
  });

  it('M4.7-E4 a page that is not embedded posts no kvman.lost and shows the toast as before', async () => {
    const spy = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => undefined);
    const api = notesApi();
    const app = await mountApp(api, '/notes/list');
    api.offline = true;
    await click(app.find('button[aria-label="Language"]'));
    await click(app.find('[data-test="language-ar"]'));
    expect(spy).not.toHaveBeenCalled();
    expect(app.text()).toContain("kvman didn't answer. Is it still running?");
    expect(app.find('[data-test="status-line"]')).toBeNull();
  });

  it('M4.7-E5 with no status items and kvman answering there is no status line', async () => {
    const api = notesApi({ ui: notesUi({ status: [] }) });
    const app = await mountApp(api, '/notes/list?embed=parent');
    expect(app.find('[data-test="status-line"]')).toBeNull();
  });
});
