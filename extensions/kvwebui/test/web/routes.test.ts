import { describe, expect, it } from 'vitest';
import { fail } from './support/fake-api.ts';
import { button, click, extension, mountApp } from './support/mount-app.ts';
import { notesApi, notesUi } from './support/notes.ts';

const listWith = (...children: unknown[]) =>
  notesUi({
    pages: [
      { id: 'list', title: 'notes.pages.list', view: { type: 'stack', direction: 'vertical', children } },
      { id: 'note', title: 'notes.pages.note', params: ['noteId'], view: { type: 'text', text: 'notes.note.showing', params: { id: { $param: 'noteId' } } } },
    ],
  } as never);

describe('routes and the home page (06 §6.3)', () => {
  it("M2.2-H4 a then with $output opens the created item's page, and a link navigates without a command", async () => {
    const create = { type: 'button', text: 'notes.done', command: 'notes.note.create', input: {}, then: { navigate: 'notes.note', params: { noteId: { $output: 'id' } } } };
    const link = { type: 'link', text: 'notes.nav.list', to: { page: 'notes.note', params: { noteId: 'n1' } } };
    const api = notesApi({ ui: listWith(create, link) });
    const app = await mountApp(api, '/notes/list');
    await click(button(app, 'Done.'));
    expect(app.router.currentRoute.value.fullPath).toBe('/notes/note/n7');
    expect(app.text()).toContain('Showing note n7');
    await app.router.push('/notes/list');
    await app.settle();
    const commands = api.calls.filter((call) => call.kind === 'commands').length;
    await click(app.findAll('a').find((anchor) => anchor.getAttribute('href') === '/notes/note/n1') ?? null);
    expect(app.router.currentRoute.value.fullPath).toBe('/notes/note/n1');
    expect(app.text()).toContain('Showing note n1');
    expect(api.calls.filter((call) => call.kind === 'commands')).toHaveLength(commands);
  });

  it("M2.2-H6 / shows the preset's home page; a missing one shows Extensions with HOME_UNAVAILABLE; kvwebui's page shows kvwebui.home locked", async () => {
    const home = await mountApp(notesApi(), '/');
    expect(home.find('h1')?.textContent).toBe('Notes');
    expect(home.find('[data-test="nav-notes.list"]')?.getAttribute('aria-current')).toBe('page');
    const api = notesApi({ home: 'ghost.start' });
    api.extensions.push(extension('ghost'), { ...extension('kvwebui'), name: '@kvman/kvwebui', queries: [] });
    api.handlers.set('ghost.ui.get', () => fail('ghost/DOWN'));
    const missing = await mountApp(api, '/');
    const card = missing.find('[data-test="home-unavailable"]');
    expect(card?.textContent).toContain("The home page, ghost.start, isn't available.");
    expect(card?.querySelector('[data-test="problem-code"]')?.textContent).toBe('ghost/DOWN');
    expect(missing.find('h1')?.textContent).toBe('Extensions');
    await missing.router.push('/kvwebui/extension/kvwebui');
    await missing.settle();
    const row = missing.find('[data-test="setting-kvwebui.home"]');
    expect(row?.querySelector('[data-test="setting-locked"]')?.textContent).toContain('ghost.start');
    expect(row?.textContent).toContain('Set by the test preset');
    expect(row?.querySelectorAll('input, select, textarea')).toHaveLength(0);
  });

  it('M2.2-E3 a page with params renders, and unknown pages and links to missing pages show "page not found"', async () => {
    const api = notesApi({ ui: listWith({ type: 'link', text: 'notes.nav.list', to: { page: 'notes.gone' } }) });
    const app = await mountApp(api, '/notes/note/n3');
    expect(app.text()).toContain('Showing note n3');
    for (const path of ['/notes/nope', '/elsewhere/x/y', '/notes/note']) {
      await app.router.push(path);
      await app.settle();
      expect(app.find('[data-test="not-found"]'), path).not.toBeNull();
    }
    await app.router.push('/notes/list');
    await app.settle();
    await click(app.findAll('a').find((anchor) => anchor.getAttribute('href') === '/notes/gone') ?? null);
    expect(app.find('[data-test="not-found"]')?.textContent).toContain('Page not found');
  });

  it("M2.2-E16 the browser tab's title is page · workspace · app title", async () => {
    const api = notesApi();
    api.workspaces.push({ id: 'w1', name: 'project', path: '/work/project' });
    const title = api.settings.find((spec) => spec.key === 'kvwebui.title');
    if (title !== undefined) title.preset = 'notes.app.title';
    const app = await mountApp(api, '/notes/list?workspace=w1');
    expect(document.title).toBe('Notes · project · Notes App');
    await app.router.push('/kvwebui/settings');
    await app.settle();
    expect(document.title).toBe('Settings · project · Notes App');
  });
});
