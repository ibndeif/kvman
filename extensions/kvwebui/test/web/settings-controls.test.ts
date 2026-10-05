import { describe, expect, it } from 'vitest';
import { setting } from './support/fake-api.ts';
import { type } from './support/mount-app.ts';
import { leave, openSettings } from './support/settings-page.ts';

describe("a setting row's controls, and the Settings page's search (06 §6.6, ADR 0013, 4 and 6)", () => {
  it('QA20-H8 a select names each option from the catalog, or by its value, and sends the value', async () => {
    const { control, sets } = await openSettings((api) => {
      api.settings.push(setting('notes.mode', { type: 'string', enum: ['auto', 'ask'] }, ['global'], { default: 'ask' }));
      api.catalogs['en'] = { ...api.catalogs['en'], 'notes.mode.options.auto': 'Ask only when it matters' };
    });
    const select = control<HTMLSelectElement>('notes.mode');
    expect([...(select?.options ?? [])].map((option) => [option.value, option.textContent])).toEqual([['"auto"', 'Ask only when it matters'], ['"ask"', 'ask']]);
    await type(select, '"auto"');
    expect(sets()).toEqual([{ key: 'notes.mode', value: 'auto', scope: 'global' }]);
    const own = await openSettings(undefined, 'kvwebui');
    expect([...(own.control<HTMLSelectElement>('kvwebui.theme')?.options ?? [])].map((option) => option.textContent)).toEqual(['Same as your system', 'Light', 'Dark']);
  });

  it('QA20-H9 Language lists the installed languages by their own names, and picking one switches the app', async () => {
    const { app, control, sets } = await openSettings(undefined, 'settings');
    const select = control<HTMLSelectElement>('kernel.language');
    expect(select?.tagName).toBe('SELECT');
    expect([...(select?.options ?? [])].map((option) => [option.value, option.textContent, option.lang])).toEqual([['en', 'English', 'en'], ['ar', 'العربية', 'ar']]);
    expect(select?.value).toBe('en');
    await type(select, 'ar');
    expect(sets()).toEqual([{ key: 'kernel.language', value: 'ar', scope: 'global' }]);
    expect(document.documentElement.dir).toBe('rtl');
    expect(app.find('h1')?.textContent).toBe('الإعدادات');
  });

  it('QA20-H10 search filters by title, description, or key in any case, and says when nothing matches', async () => {
    const { app } = await openSettings((api) => {
      api.settings.push(setting('kernel.port', { type: 'integer' }, ['global'], { default: 3737 }), setting('kernel.jobs.retentionDays', { type: 'integer' }, ['global'], { default: 7 }));
      api.catalogs['en'] = { ...api.catalogs['en'], 'kernel.port.title': 'Port', 'kernel.jobs.retentionDays.description': 'How long finished jobs are kept.' };
    }, 'settings');
    const shown = () => app.findAll('[data-test^="setting-"][data-test*="."]').map((row) => row.dataset['test']);
    const search = () => app.find('[data-test="settings-search"]');
    const everything = shown();
    expect(everything).toHaveLength(3);

    await type(search(), 'PORT');
    expect(shown()).toEqual(['setting-kernel.port']);
    await type(search(), 'finished JOBS are');
    expect(shown()).toEqual(['setting-kernel.jobs.retentionDays']);
    await type(search(), 'el.lang');
    expect(shown()).toEqual(['setting-kernel.language']);

    await type(search(), 'no such thing');
    expect(shown()).toEqual([]);
    expect(app.find('[data-test="settings-none"]')?.textContent).toBe('No setting matches.');
    await type(search(), '');
    expect(shown()).toEqual(everything);
    expect(app.find('[data-test="settings-none"]')).toBeNull();
  });

  it("QA20-E6 a value that can't be read is marked and never sent", async () => {
    const { part, control, sets } = await openSettings((api) => api.settings.push(setting('notes.rules', { type: 'array', items: { type: 'object' } }, ['global'], { default: [] })));
    const field = control<HTMLTextAreaElement>('notes.rules');
    expect(field?.tagName).toBe('TEXTAREA');
    await type(field, '[');
    await leave(field);
    expect(part('notes.rules', 'field-invalid')).not.toBeNull();
    expect(sets()).toEqual([]);
    await type(field, '[{ "name": "a" }]');
    await leave(field);
    expect(part('notes.rules', 'field-invalid')).toBeNull();
    expect(sets()).toEqual([{ key: 'notes.rules', value: [{ name: 'a' }], scope: 'global' }]);
  });
});
