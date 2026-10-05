import type { Json } from '@kvman/sdk';
import { describe, expect, it } from 'vitest';
import { fail } from './support/fake-api.ts';
import { click, extension, mountApp } from './support/mount-app.ts';
import { notesApi, notesUi } from './support/notes.ts';

const page = (id: string, view: Json, params?: string[]) => ({ id, title: 'notes.pages.list', ...(params === undefined ? {} : { params }), view });
const text = { type: 'text', text: 'notes.help.body' };
const answer = (parts: Record<string, Json>) => ({ pages: [page('p', text)], nav: [], panels: [], status: [], ...parts });

describe('contributions (06 §6.2–§6.3)', () => {
  it("M2.2-H1 a test extension's pages, nav, panels, and status items render", async () => {
    const app = await mountApp(notesApi(), '/notes/list');
    expect(app.find('[data-test="nav"]')?.textContent).toContain('Notes');
    expect(app.findAll('[data-test^="nav-"]').map((link) => link.dataset['test'])).toEqual(['nav-notes.list', 'nav-kvwebui.settings', 'nav-kvwebui.extensions', 'nav-toggle']);
    expect(app.find('h1')?.textContent).toBe('Notes');
    expect(app.findAll('[data-test="table-row"]').map((row) => row.textContent)).toEqual(['First3', 'Second1', 'Third12']);
    expect(app.find('[data-test="panel-notes.help"]')).toBeNull();
    await click(app.find('[data-test="panel-button-notes.help"]'));
    expect(app.find('[data-test="panel-notes.help"]')?.textContent).toContain('Notes keep your thoughts.');
    expect(app.find('[data-test="status-notes.count"]')?.textContent).toBe('3 notes');
    expect(app.find('[data-test="health"]')?.textContent).toContain('kvman 0.1.0');
  });

  it('M2.2-H2 an invalid ui.get shows an error card while the others render', async () => {
    const api = notesApi();
    api.extensions.push(extension('broken'), extension('failing'));
    api.handlers.set('broken.ui.get', () => answer({ pages: [page('p', { type: 'chart' })] }));
    api.handlers.set('failing.ui.get', () => fail('failing/DOWN'));
    const app = await mountApp(api, '/notes/list');
    expect(app.findAll('[data-test="table-row"]')).toHaveLength(3);
    const broken = app.find('[data-test="load-failure-broken"]');
    expect(broken?.textContent).toContain('@test/broken couldn');
    expect(broken?.querySelector('[data-test="problem-code"]')?.textContent).toBe('VALIDATION_FAILED');
    expect(broken?.textContent).toContain('pages.0.view.type');
    expect(app.find('[data-test="load-failure-failing"] [data-test="problem-code"]')?.textContent).toBe('failing/DOWN');
    expect([...app.state.registry.value.pages.keys()]).toEqual(['notes.list', 'notes.note']);
    await click(broken?.querySelector<HTMLElement>('button[aria-label="Dismiss"]') ?? null);
    expect(app.find('[data-test="load-failure-broken"]')).toBeNull();
    expect(app.find('[data-test="load-failure-failing"]')).not.toBeNull();
  });

  it('M2.2-E1 each invalid answer contributes nothing and is listed with VALIDATION_FAILED', async () => {
    const withPrivate = (namespace: string) => extension(namespace, { queries: [{ name: `${namespace}.secret.get`, public: false }], commands: [{ name: `${namespace}.hidden`, public: false }] });
    const table = (query: string) => ({ type: 'table', query, input: {}, columns: [{ field: 'id', title: 'notes.columns.title' }] });
    const cases: Record<string, Json> = {
      component: answer({ pages: [page('p', { type: 'chart' })] }),
      private: answer({ pages: [page('p', table('private.secret.get'))] }),
      unknown: answer({ pages: [page('p', table('nowhere.list.get'))] }),
      params: answer({ pages: [page('p', text, ['id'])], nav: [{ id: 'n', page: 'p', title: 'notes.nav.list', icon: 'notebook', order: 1 }] }),
      nopage: answer({ nav: [{ id: 'n', page: 'gone', title: 'notes.nav.list', icon: 'notebook', order: 1 }] }),
      pageids: answer({ pages: [page('p', text), page('p', text)] }),
      statusids: answer({ status: [0, 1].map(() => ({ id: 's', query: 'kernel.health.get', input: {}, text: 'notes.status.count', order: 1 })) }),
      icon: answer({ panels: [{ id: 'x', title: 'notes.panels.help', icon: 'not-an-icon', view: text }] }),
      form: answer({ pages: [page('p', { type: 'form', command: 'form.hidden', submit: 'notes.done' })] }),
      param: answer({ pages: [page('p', { type: 'text', text: 'notes.note.showing', params: { id: { $param: 'noteId' } } })] }),
      shape: answer({ nav: [{ id: 'n', page: 'p', title: 'notes.nav.list', icon: 'notebook' }] }),
    };
    const api = notesApi();
    for (const [namespace, ui] of Object.entries(cases)) {
      api.extensions.push(withPrivate(namespace));
      api.handlers.set(`${namespace}.ui.get`, () => ui);
    }
    const app = await mountApp(api, '/notes/list');
    for (const namespace of Object.keys(cases)) {
      expect(app.find(`[data-test="load-failure-${namespace}"] [data-test="problem-code"]`)?.textContent, namespace).toBe('VALIDATION_FAILED');
    }
    const registry = app.state.registry.value;
    const contributed = [...registry.pages.keys(), ...registry.nav.map((item) => item.id), ...registry.panels.map((panel) => panel.id), ...registry.status.map((item) => item.id)];
    expect(contributed.filter((id) => !id.startsWith('notes.'))).toEqual([]);
  });

  it('QA21-E1, QA21-E2, and QA21-E3 a setting view belongs in configuration and names an own key, and a configuration is checked like a view', async () => {
    const own = { type: 'setting', key: 'own.size' };
    const cases: Record<string, { ui: Json; says: string }> = {
      inpage: { ui: answer({ pages: [page('p', own)] }), says: 'pages.0.view.key' },
      inpanel: { ui: answer({ panels: [{ id: 'x', title: 'notes.panels.help', icon: 'notebook', view: { type: 'card', children: [own] } }] }), says: 'belongs in configuration' },
      foreign: { ui: answer({ configuration: { type: 'stack', direction: 'vertical', children: [{ type: 'setting', key: 'kvwebui.theme' }] } }), says: "isn't one of the extension's settings" },
      query: { ui: answer({ configuration: { type: 'table', query: 'query.secret.get', input: {}, columns: [{ field: 'id', title: 'notes.columns.title' }] } }), says: "isn't a public query" },
      param: { ui: answer({ configuration: { type: 'text', text: 'notes.note.showing', params: { id: { $param: 'noteId' } } } }), says: "isn't declared" },
    };
    const api = notesApi();
    for (const [namespace, { ui }] of Object.entries(cases)) {
      api.extensions.push({ ...extension(namespace, { queries: [{ name: `${namespace}.secret.get`, public: false }] }), settings: [{ key: 'own.size', description: 'A size.', scopes: ['global'] }] });
      api.handlers.set(`${namespace}.ui.get`, () => ui);
    }
    api.extensions.push({ ...extension('good'), settings: [{ key: 'own.size', description: 'A size.', scopes: ['global'] }] });
    api.handlers.set('good.ui.get', () => answer({ configuration: { type: 'card', children: [own] } }));
    const app = await mountApp(api, '/notes/list');
    for (const [namespace, { says }] of Object.entries(cases)) {
      const card = app.find(`[data-test="load-failure-${namespace}"]`);
      expect(card?.querySelector('[data-test="problem-code"]')?.textContent, namespace).toBe('VALIDATION_FAILED');
      expect(card?.textContent, namespace).toContain(says);
    }
    expect([...app.state.registry.value.configurations.keys()]).toEqual(['kvwebui', 'good']);
  });

  it("M2.2-E2 the kernel's own queries and commands count as public", async () => {
    const api = notesApi();
    api.extensions.push(extension('files'));
    api.handlers.set('kernel.files.list', () => []);
    api.handlers.set('files.ui.get', () =>
      answer({ pages: [page('p', { type: 'stack', direction: 'vertical', children: [{ type: 'table', query: 'kernel.files.list', input: { limit: 10 }, columns: [{ field: 'name', title: 'notes.columns.title' }] }, { type: 'form', command: 'kernel.workspace.open', submit: 'notes.done' }] })] }),
    );
    const app = await mountApp(api, '/files/p');
    expect(app.find('[data-test="load-failure-files"]')).toBeNull();
    expect(app.findAll('[data-test="form-kernel.workspace.open"] [data-field]').map((field) => field.dataset['field'])).toEqual(['path']);
  });

  it('M2.2-E15 the nav follows kvwebui.nav.order, order, and full id, leaves hidden items out, and stays collapsed', async () => {
    const api = notesApi({ ui: notesUi({ nav: [] }) });
    const items: [string, string, number][] = [['b', 'x', 1], ['a', 'y', 1], ['c', 'z', 0], ['d', 'w', 5]];
    for (const [namespace, id, order] of items) {
      api.extensions.push(extension(namespace));
      api.handlers.set(`${namespace}.ui.get`, () => answer({ nav: [{ id, page: 'p', title: 'notes.nav.list', icon: 'notebook', order }] }));
    }
    api.global.set('kvwebui.nav.order', ['d.w']);
    api.global.set('kvwebui.nav.hidden', ['c.z']);
    const app = await mountApp(api, '/notes/list');
    const contributed = () => app.findAll('[data-test^="nav-"]').map((link) => link.dataset['test']).filter((id) => id !== 'nav-toggle' && id?.startsWith('nav-kvwebui.') !== true);
    expect(contributed()).toEqual(['nav-d.w', 'nav-a.y', 'nav-b.x']);
    await click(app.find('[data-test="nav-toggle"]'));
    expect(app.find('[data-test="nav-d.w"]')?.textContent).toBe('');
    expect(app.find('[data-test="nav-d.w"]')?.getAttribute('aria-label')).toBe('Notes');
    const again = await mountApp(api, '/notes/list');
    expect(again.find('[data-test="nav-d.w"]')?.textContent).toBe('');
  });
});
