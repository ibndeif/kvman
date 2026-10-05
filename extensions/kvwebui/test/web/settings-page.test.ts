import { describe, expect, it } from 'vitest';
import { fail, setting } from './support/fake-api.ts';
import { click, type } from './support/mount-app.ts';
import { leave, openSettings, pressEnter } from './support/settings-page.ts';

describe('setting rows (06 §6.6, ADR 0009, 77; ADR 0013, 2 to 5; ADR 0014, 1 and 3)', () => {
  it("QA21-H1 the Settings page holds kvman's own settings only: no scope switch, no secrets, and a change is global", async () => {
    const { app, part, control, sets } = await openSettings((api) => api.settings.push(setting('kernel.jobs.retentionDays', { type: 'integer', minimum: 0 }, ['global'], { default: 7 })), 'settings');
    expect(app.findAll('[data-test^="setting-"][data-test*="."]').map((row) => row.dataset['test'])).toEqual(['setting-kernel.language', 'setting-kernel.jobs.retentionDays']);
    expect(app.findAll('[data-test^="scope-"]')).toEqual([]);
    expect(app.find('[data-test="secrets"]')).toBeNull();
    expect(app.find('[data-test="settings-search"]')).not.toBeNull();
    expect(app.find('[data-test="settings-extensions"]')?.getAttribute('href')).toBe('/kvwebui/extensions');
    expect(part('kernel.language', 'setting-title')?.textContent).toBe('kernel.language');
    await type(control('kernel.jobs.retentionDays'), '3');
    await pressEnter(control('kernel.jobs.retentionDays'));
    expect(sets()).toEqual([{ key: 'kernel.jobs.retentionDays', value: 3, scope: 'global' }]);
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
    const { part, control, sets, resets } = await openSettings(undefined, 'kvwebui');
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
    const { app, part, control, sets } = await openSettings((api) => api.settings.push(setting('notes.mode', { type: 'string', enum: ['auto', 'ask'] }, ['global'], { default: 'ask' })));
    expect(part('notes.mode', 'setting-global-only')).toBeNull();
    await click(app.find('[data-test="scope-workspace"]'));
    expect(part('notes.mode', 'setting-global-only')?.textContent).toBe('The same in every workspace.');
    expect(part('notes.pageSize', 'setting-global-only')).toBeNull();
    await type(control('notes.mode'), '"auto"');
    expect(sets()).toEqual([{ key: 'notes.mode', value: 'auto', scope: 'global' }]);
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
