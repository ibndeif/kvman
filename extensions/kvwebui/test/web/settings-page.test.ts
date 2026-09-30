import { describe, expect, it } from 'vitest';
import { setting } from './support/fake-api.ts';
import { click, mountApp, type } from './support/mount-app.ts';
import { notesApi } from './support/notes.ts';

describe('the Settings page (06 §6.6, ADR 0009, 77)', () => {
  it('M2.2-E12 groups, titles, scopes, sources, saving, resetting, and secrets that are never shown', async () => {
    const api = notesApi();
    api.settings.push(setting('notes.pageSize', { type: 'integer' }, ['global', 'workspace'], { default: 20 }));
    api.catalogs['en'] = { ...api.catalogs['en'], 'notes.title': 'Notes', 'notes.pageSize.title': 'Page size' };
    api.perWorkspace.set('home', new Map([['notes.pageSize', 30]]));
    let secrets = [{ extension: '@test/notes', name: 'token' }];
    api.handlers.set('kernel.secrets.list', () => secrets);
    api.handlers.set('kernel.secrets.set', () => ({}));
    api.handlers.set('kernel.secrets.delete', () => {
      secrets = [];
      return {};
    });
    const app = await mountApp(api, '/kvwebui/settings');
    expect(app.findAll('[data-test^="group-"]').map((group) => group.textContent)).toEqual(['kvman', 'Interface (kvwebui)', 'Notes (notes)']);
    const row = (key: string) => app.find(`[data-test="setting-${key}"]`);
    expect(row('notes.pageSize')?.querySelector('[data-test="setting-title"]')?.textContent).toBe('Page size');
    expect(row('kernel.language')?.querySelector('[data-test="setting-title"]')?.textContent).toBe('kernel.language');
    expect(row('notes.pageSize')?.querySelector('[data-test="setting-source"]')?.textContent).toBe('Set for this workspace');
    expect(row('kvwebui.nav.order')?.querySelector('[data-test="setting-source"]')?.textContent).toBe('Default');
    expect(row('kvwebui.theme')?.querySelector('[data-test="scope-workspace"]')).toBeNull();
    expect(row('kvwebui.title')?.querySelector('[data-test="setting-locked"]')).not.toBeNull();

    await click(row('notes.pageSize')?.querySelector<HTMLElement>('[data-test="setting-reset"]') ?? null);
    expect(api.callsTo('kernel.settings.reset').map((call) => call.input)).toEqual([{ key: 'notes.pageSize', scope: 'workspace' }]);
    expect(row('notes.pageSize')?.querySelector('[data-test="setting-source"]')?.textContent).toBe('Default');
    await click(row('notes.pageSize')?.querySelector<HTMLElement>('[data-test="scope-workspace"]') ?? null);
    await type(row('notes.pageSize')?.querySelector<HTMLElement>('input') ?? null, '50');
    await click(row('notes.pageSize')?.querySelector<HTMLElement>('[data-test="setting-save"]') ?? null);
    expect(api.callsTo('kernel.settings.set').map((call) => call.input)).toEqual([{ key: 'notes.pageSize', value: 50, scope: 'workspace' }]);

    expect(app.findAll('[data-test="secret"]').map((secret) => secret.textContent)).toEqual([expect.stringContaining('token')]);
    await click(app.find('[data-test="secret-add"]'));
    expect(app.find<HTMLInputElement>('[data-test="secret-value"]')?.type).toBe('password');
    await type(app.find('[data-test="secret-extension"]'), '@test/notes');
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
});
