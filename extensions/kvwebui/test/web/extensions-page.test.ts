import { describe, expect, it } from 'vitest';
import { click, extension, mountApp, type } from './support/mount-app.ts';
import { notesApi } from './support/notes.ts';

describe('the Extensions page (06 §6.6, ADR 0014, 4 and 5)', () => {
  it('QA21-H2 and M2.2-E13 each extension is a link to its page with its title, name, version, and source, and no API; search filters', async () => {
    const api = notesApi();
    api.extensions.push(extension('remote', { commands: [{ name: 'remote.sync.run' }] }, 'npm:1.2.3'), extension('local', {}, 'path:../local'));
    for (const namespace of ['remote', 'local']) api.handlers.set(`${namespace}.ui.get`, () => ({ pages: [], nav: [], panels: [], status: [] }));
    api.catalogs['en'] = { ...api.catalogs['en'], 'notes.title': 'Notebook' };
    const app = await mountApp(api, '/kvwebui/extensions');
    const card = (namespace: string) => app.find(`[data-test="extension-${namespace}"]`);
    const part = (namespace: string, name: string) => card(namespace)?.querySelector(`[data-test="extension-${name}"]`)?.textContent;
    expect(['notes', 'remote', 'local'].map((namespace) => part(namespace, 'source'))).toEqual(['Bundled', 'npm', 'Local folder']);
    expect(['notes', 'remote'].map((namespace) => [part(namespace, 'title'), part(namespace, 'name'), part(namespace, 'version')])).toEqual([['Notebook', '@test/notes', '0.1.0'], ['remote', '@test/remote', '0.1.0']]);
    expect(['notes', 'remote', 'local'].map((namespace) => card(namespace)?.getAttribute('href'))).toEqual(['/kvwebui/extension/notes', '/kvwebui/extension/remote', '/kvwebui/extension/local']);
    expect(app.text()).not.toMatch(/notes\.note\.add|remote\.sync\.run|Commands|Queries|Handlers|Public/);

    const shown = () => app.findAll('a[data-test^="extension-"]').map((link) => link.dataset['test']);
    await type(app.find('[data-test="extensions-search"]'), 'NOTEB');
    expect(shown()).toEqual(['extension-notes']);
    await type(app.find('[data-test="extensions-search"]'), '@test/re');
    expect(shown()).toEqual(['extension-remote']);
    await type(app.find('[data-test="extensions-search"]'), 'nothing');
    expect(app.find('[data-test="extensions-none"]')?.textContent).toBe('No extension matches.');
    await type(app.find('[data-test="extensions-search"]'), '');
    await click(card('remote'));
    expect(app.router.currentRoute.value.path).toBe('/kvwebui/extension/remote');
    expect(app.find('[data-test="extension-page-remote"]')).not.toBeNull();
  });

  it('QA20-E10 names keep their direction: an extension name and its version are left to right', async () => {
    const app = await mountApp(notesApi(), '/kvwebui/extensions');
    const card = app.find('[data-test="extension-notes"]');
    expect([card?.querySelector('[data-test="extension-name"]')?.textContent, card?.querySelector('[data-test="extension-name"]')?.getAttribute('dir')]).toEqual(['@test/notes', 'ltr']);
    expect(card?.querySelector('[data-test="extension-version"]')?.getAttribute('dir')).toBe('ltr');
    expect(app.find<HTMLInputElement>('[data-test="add-source"]')?.dir).toBe('ltr');
  });
});
