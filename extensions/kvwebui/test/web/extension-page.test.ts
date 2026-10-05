import { describe, expect, it } from 'vitest';
import { defineComponent, h, inject } from 'vue';
import type { Kvman } from '@kvman/sdk/web';
import { kernelQuerySchemas } from '@kvman/sdk';
import { createFakeComponents } from './support/fake-components.ts';
import { click, extension, mountApp, type } from './support/mount-app.ts';
import { notesUi } from './support/notes.ts';
import { configuredApi, notesConfiguration, openSettings, pressEnter } from './support/settings-page.ts';

// A component that shows the scope its `kvman` gives.
const scopeProbe = defineComponent({
  setup: () => {
    const kvman = inject<Kvman>('kvman');
    return () => h('p', { 'data-test': 'probe' }, kvman?.scope.value);
  },
});

describe("an extension's page (06 §6.6, ADR 0014)", () => {
  it('QA21-H3 the page shows the link back, what the extension is, Remove, the scope switch, and the configuration the extension gave', async () => {
    const { app, row } = await openSettings();
    const page = app.find('[data-test="extension-page-notes"]');
    expect(page?.querySelector('[data-test="extension-back"]')?.getAttribute('href')).toBe('/kvwebui/extensions');
    expect(['title', 'name', 'version', 'source'].map((part) => page?.querySelector(`[data-test="extension-${part}"]`)?.textContent)).toEqual(['Notes', '@test/notes', '0.1.0', 'Bundled']);
    expect(page?.querySelector('[data-test="remove"]')).not.toBeNull();
    expect(app.findAll('[data-test^="scope-"]').map((button) => [button.textContent.trim(), button.getAttribute('aria-pressed')])).toEqual([['All workspaces', 'true'], ['Only ahmed', 'false']]);
    expect(page?.querySelector('h2')?.textContent).toBe('Lists');
    expect(row('notes.pageSize')?.querySelector('[data-test="setting-title"]')?.textContent).toBe('Page size');
    expect(document.title).toBe('Notes · Home · kvman');
    expect(app.find('[data-test="nav-kvwebui.extensions"]')?.getAttribute('aria-current')).toBe('page');
  });

  it("QA21-H4 a setting row saves into the page's scope", async () => {
    const { app, control, sets } = await openSettings();
    await type(control('notes.pageSize'), '50');
    await pressEnter(control('notes.pageSize'));
    await click(app.find('[data-test="scope-workspace"]'));
    await type(control('notes.pageSize'), '60');
    await pressEnter(control('notes.pageSize'));
    expect(sets()).toEqual([{ key: 'notes.pageSize', value: 50, scope: 'global' }, { key: 'notes.pageSize', value: 60, scope: 'workspace' }]);
  });

  it("QA21-H5 the page lists the extension's own secrets, masked, adds one without showing it, and deletes after a confirmation", async () => {
    let secrets = [{ extension: '@test/notes', name: 'token' }, { extension: '@kvman/kvwebui', name: 'other' }];
    const { api, app } = await openSettings((fake) => {
      fake.handlers.set('kernel.secrets.list', () => secrets);
      fake.handlers.set('kernel.secrets.set', () => ({}));
      fake.handlers.set('kernel.secrets.delete', () => {
        secrets = secrets.filter((secret) => secret.name !== 'token');
        return {};
      });
    });
    expect(app.findAll('[data-test="secret-name-shown"]').map((secret) => secret.textContent)).toEqual(['token']);
    await click(app.find('[data-test="secret-add"]'));
    expect(app.find('[data-test="secret-extension"]')).toBeNull();
    expect(app.find<HTMLInputElement>('[data-test="secret-value"]')?.type).toBe('password');
    await type(app.find('[data-test="secret-name"]'), 'api');
    await type(app.find('[data-test="secret-value"]'), 's3cr3t-value');
    await click(app.find('[data-test="secret-save"]'));
    expect(api.callsTo('kernel.secrets.set').map((call) => call.input)).toEqual([{ extension: '@test/notes', name: 'api', value: 's3cr3t-value' }]);
    expect(app.root.innerHTML).not.toContain('s3cr3t-value');
    await click(app.find('[data-test="secret-delete-token"]'));
    await click(document.querySelector<HTMLElement>('[data-test="confirm-ok"]'));
    expect(api.callsTo('kernel.secrets.delete').map((call) => call.input)).toEqual([{ extension: '@test/notes', name: 'token' }]);
    expect(app.findAll('[data-test="secret"]')).toEqual([]);
  });

  it("QA21-H6 a custom component reads the page's scope, and global on a normal page", async () => {
    const probe = { type: 'custom', component: 'notes.probe', props: {} };
    const api = configuredApi();
    api.handlers.set('notes.ui.get', () => notesUi({ configuration: { type: 'stack', direction: 'vertical', children: [notesConfiguration(api), probe] }, pages: [{ id: 'list', title: 'notes.pages.list', view: probe }] }));
    const components = createFakeComponents();
    components.define('notes.probe', scopeProbe);
    const app = await mountApp(api, '/kvwebui/extension/notes', components);
    expect(app.find('[data-test="probe"]')?.textContent).toBe('global');
    await click(app.find('[data-test="scope-workspace"]'));
    expect(app.find('[data-test="probe"]')?.textContent).toBe('workspace');
    await app.router.push('/notes/list');
    await app.settle();
    expect(app.find('[data-test="probe"]')?.textContent).toBe('global');
  });

  it("QA21-H7 and M2.2-E12 kvwebui's own page shows its theme and nav settings, and its title and home page locked", async () => {
    const { app, part } = await openSettings(undefined, 'kvwebui');
    expect(app.find('[data-test="extension-title"]')?.textContent).toBe('Interface');
    expect(app.findAll('h2').map((heading) => heading.textContent).slice(0, 3)).toEqual(['Appearance', 'Navigation', 'App']);
    expect(app.findAll('[data-test^="setting-kvwebui."]').map((row) => row.dataset['test'])).toEqual(['setting-kvwebui.theme', 'setting-kvwebui.nav.order', 'setting-kvwebui.nav.hidden', 'setting-kvwebui.title', 'setting-kvwebui.home']);
    for (const key of ['kvwebui.title', 'kvwebui.home']) {
      expect(part(key, 'setting-locked'), key).not.toBeNull();
      expect(part(key, 'setting-control'), key).toBeNull();
    }
    expect(part('kvwebui.theme', 'setting-control')).not.toBeNull();
  });

  it('QA21-E4 an extension with nothing to configure says so, with no scope switch, and still has its secrets', async () => {
    const api = configuredApi();
    api.extensions.push(extension('plain'));
    api.handlers.set('plain.ui.get', () => ({ pages: [], nav: [], panels: [], status: [] }));
    const app = await mountApp(api, '/kvwebui/extension/plain');
    expect(app.find('[data-test="extension-nothing"]')?.textContent).toBe('This extension has nothing to configure.');
    expect(app.findAll('[data-test^="scope-"]')).toEqual([]);
    expect(app.find('[data-test="extension-title"]')?.textContent).toBe('plain');
    expect(app.find('[data-test="secrets"]')).not.toBeNull();
  });

  it('QA21-E5 a namespace that is not loaded shows page not found', async () => {
    const app = await mountApp(configuredApi(), '/kvwebui/extension/nope');
    expect(app.find('[data-test="not-found"]')).not.toBeNull();
    expect(app.find('[data-test^="extension-page-"]')).toBeNull();
  });

  it('QA21-E6 an extension the stored preset no longer has shows Removed after restart, and no Remove', async () => {
    const api = configuredApi();
    api.preset = kernelQuerySchemas['kernel.preset.get'].output.parse({ name: 'test', origin: 'home', file: '/home/ahmed/.kvman/presets/test.json', extensions: { '@kvman/kvwebui': 'bundled' } });
    const app = await mountApp(api, '/kvwebui/extension/notes');
    expect(app.find('[data-test="extension-page-notes"] [data-test="extension-mark"]')?.textContent).toBe('Removed after restart');
    expect(app.find('[data-test="remove"]')).toBeNull();
    await click(app.find('[data-test="extension-back"]'));
    expect(app.find('[data-test="extension-notes"] [data-test="extension-mark"]')?.textContent).toBe('Removed after restart');
  });
});
