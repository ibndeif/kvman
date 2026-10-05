import { describe, expect, it } from 'vitest';
import { fail } from './support/fake-api.ts';
import { click, type } from './support/mount-app.ts';
import { leave, openSettings, pressEnter } from './support/settings-page.ts';

describe('the Settings page (06 §6.6, ADR 0009, 77; ADR 0013, 2 to 5)', () => {
  it('QA20-E7 and M2.2-E12 groups, titles, a locked key, and secrets that are never shown', async () => {
    let secrets = [{ extension: '@test/notes', name: 'token' }];
    const { api, app, part } = await openSettings((fake) => {
      fake.handlers.set('kernel.secrets.list', () => secrets);
      fake.handlers.set('kernel.secrets.set', () => ({}));
      fake.handlers.set('kernel.secrets.delete', () => {
        secrets = [];
        return {};
      });
    });
    expect(app.findAll('[data-test^="group-"]').map((group) => group.textContent)).toEqual(['kvman', 'Interface (kvwebui)', 'Notes (notes)']);
    expect(part('notes.pageSize', 'setting-title')?.textContent).toBe('Page size');
    expect(part('kernel.language', 'setting-title')?.textContent).toBe('kernel.language');
    expect(part('kvwebui.title', 'setting-locked')).not.toBeNull();
    expect(part('kvwebui.title', 'setting-control')).toBeNull();

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

  it('QA20-H4 one switch for the page says where changes are stored, and no row has a scope or a Save button', async () => {
    const { app } = await openSettings();
    const scopes = app.findAll('[data-test^="scope-"]');
    expect(scopes.map((button) => [button.dataset['test'], button.textContent.trim(), button.getAttribute('aria-pressed')])).toEqual([['scope-global', 'All workspaces', 'true'], ['scope-workspace', 'Only ahmed', 'false']]);
    expect(app.findAll('[data-test^="setting-"] [data-test^="scope-"]')).toEqual([]);
    expect(app.findAll('[data-test="setting-save"]')).toEqual([]);
    await click(app.find('[data-test="scope-workspace"]'));
    expect(app.find('[data-test="scope-workspace"]')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('QA20-H5 a select saves as it changes, says Saved, and then shows Changed with its reset', async () => {
    const { part, control, sets, resets } = await openSettings();
    expect(part('kvwebui.theme', 'setting-changed')).toBeNull();
    await type(control('kvwebui.theme'), '"dark"');
    expect(sets()).toEqual([{ key: 'kvwebui.theme', value: 'dark', scope: 'global' }]);
    expect(part('kvwebui.theme', 'setting-saved')?.textContent).toBe('Saved');
    expect(part('kvwebui.theme', 'setting-changed')?.textContent).toBe('Changed');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    await click(part('kvwebui.theme', 'setting-reset'));
    expect(resets()).toEqual([{ key: 'kvwebui.theme', scope: 'global' }]);
    expect(part('kvwebui.theme', 'setting-changed')).toBeNull();
    expect(control<HTMLSelectElement>('kvwebui.theme')?.value).toBe('"system"');
  });

  it('QA20-H6 a field saves on Enter and on leaving it, and the value in effect is never sent again', async () => {
    const { control, sets } = await openSettings();
    const field = () => control('notes.pageSize');
    await type(field(), '50');
    expect(sets()).toEqual([]);
    await pressEnter(field());
    await leave(field());
    expect(sets()).toEqual([{ key: 'notes.pageSize', value: 50, scope: 'global' }]);
    await type(field(), '60');
    await leave(field());
    expect(sets()).toEqual([{ key: 'notes.pageSize', value: 50, scope: 'global' }, { key: 'notes.pageSize', value: 60, scope: 'global' }]);
    await leave(field());
    expect(sets()).toHaveLength(2);
  });

  it('QA20-H7 on the workspace side a change is stored for the workspace, and its reset returns to the value of all', async () => {
    const { app, part, control, sets, resets } = await openSettings();
    await click(app.find('[data-test="scope-workspace"]'));
    await type(control('notes.pageSize'), '30');
    await pressEnter(control('notes.pageSize'));
    expect(sets()).toEqual([{ key: 'notes.pageSize', value: 30, scope: 'workspace' }]);
    expect(part('notes.pageSize', 'setting-changed')?.textContent).toBe('Changed for ahmed');
    expect(part('notes.pageSize', 'setting-reset')?.textContent).toBe('Use the value for all workspaces');
    await click(part('notes.pageSize', 'setting-reset'));
    expect(resets()).toEqual([{ key: 'notes.pageSize', scope: 'workspace' }]);
    expect(control('notes.pageSize')?.value).toBe('20');
  });

  it('QA20-H11 the key and where the value comes from are in the row details, and nowhere else in the row', async () => {
    const { row, part } = await openSettings((api) => api.global.set('notes.pageSize', 40));
    const details = part('notes.pageSize', 'setting-details');
    expect(details?.tagName).toBe('DETAILS');
    expect(details?.querySelector('summary')?.textContent).toBe('Details');
    expect(details?.querySelector('[data-test="setting-key"]')?.textContent).toBe('notes.pageSize');
    expect(details?.querySelector('[data-test="setting-source"]')?.textContent).toBe('Set for all workspaces');
    expect(row('notes.pageSize')?.querySelectorAll('[data-test="setting-key"], [data-test="setting-source"]')).toHaveLength(2);
  });

  it("QA20-E3 a workspace's own value is disabled on All workspaces and editable on the workspace", async () => {
    const { app, part, control } = await openSettings((api) => api.perWorkspace.set('home', new Map([['notes.pageSize', 30]])));
    expect(control('notes.pageSize')?.disabled).toBe(true);
    expect(control('notes.pageSize')?.value).toBe('30');
    expect(part('notes.pageSize', 'setting-own-value')?.textContent).toBe('ahmed has its own value. Switch to ahmed to change it.');
    expect(part('notes.pageSize', 'setting-reset')).toBeNull();
    await click(app.find('[data-test="scope-workspace"]'));
    expect(control('notes.pageSize')?.disabled).toBe(false);
    expect(part('notes.pageSize', 'setting-own-value')).toBeNull();
    expect(part('notes.pageSize', 'setting-changed')?.textContent).toBe('Changed for ahmed');
  });

  it('QA20-E4 on the workspace side a key with only the global scope says so and is stored globally', async () => {
    const { app, part, control, sets } = await openSettings();
    expect(part('kvwebui.theme', 'setting-global-only')).toBeNull();
    await click(app.find('[data-test="scope-workspace"]'));
    expect(part('kvwebui.theme', 'setting-global-only')?.textContent).toBe('The same in every workspace.');
    expect(part('notes.pageSize', 'setting-global-only')).toBeNull();
    await type(control('kvwebui.theme'), '"light"');
    expect(sets()).toEqual([{ key: 'kvwebui.theme', value: 'light', scope: 'global' }]);
  });

  it('QA20-E5, QA1-H6, and QA1-E5 a rejected value stays in its field with the first issue and no toast, until a valid one is saved', async () => {
    const { app, part, control } = await openSettings((api) => {
      api.handlers.set('kernel.settings.set', (input) => {
        const value = typeof input === 'object' && input !== null && !Array.isArray(input) ? input['value'] : undefined;
        return typeof value === 'number' && value < 0 ? fail('VALIDATION_FAILED', { issues: [{ path: '', message: 'Too small: expected number to be >=0' }] }) : {};
      });
    });
    await type(control('notes.pageSize'), '-5');
    await pressEnter(control('notes.pageSize'));
    expect(part('notes.pageSize', 'setting-issue')?.textContent).toBe('Too small: expected number to be >=0');
    expect(part('notes.pageSize', 'field-invalid')).not.toBeNull();
    expect(control('notes.pageSize')?.value).toBe('-5');
    expect(part('notes.pageSize', 'setting-saved')).toBeNull();
    expect(app.state.toasts.list).toEqual([]);
    await type(control('notes.pageSize'), '30');
    await pressEnter(control('notes.pageSize'));
    expect(part('notes.pageSize', 'setting-issue')).toBeNull();
    expect(part('notes.pageSize', 'field-invalid')).toBeNull();
    expect(part('notes.pageSize', 'setting-saved')).not.toBeNull();
  });
});
