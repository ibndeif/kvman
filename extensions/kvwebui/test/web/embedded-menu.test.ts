import { describe, expect, it } from 'vitest';
import { click, mountApp, type Mounted } from './support/mount-app.ts';
import { notesApi } from './support/notes.ts';

// The embedded pages menu's panels and Language row, and panels as a sheet (06 §6.2, ADR 0101, 1 and 4). In happy-dom
// the parent is the window itself.

async function openMenu(app: Mounted): Promise<void> {
  window.dispatchEvent(new MessageEvent('message', { data: { kind: 'kvman.pages' }, source: window.parent }));
  await app.settle();
}

const menuRows = (app: Mounted) => app.findAll('[data-test="pages-menu"] > *').map((row) => row.dataset['test'] ?? row.tagName.toLowerCase());

describe('the embedded pages menu (06 §6.2, ADR 0101, 1 and 4)', () => {
  it('M4.7-H9 the menu lists the pages, the panels, and Language; a panel opens as a sheet, and a language pick saves and applies it', async () => {
    const api = notesApi();
    const app = await mountApp(api, '/notes/list?embed=parent');
    await openMenu(app);
    expect(menuRows(app)).toEqual(['pages-notes.list', 'pages-panel-notes.help', 'pages-kvwebui.settings', 'pages-kvwebui.extensions', 'hr', 'pages-language']);
    expect(app.find('[data-test="pages-language"]')?.textContent).toBe('LanguageEnglish');

    await click(app.find('[data-test="pages-panel-notes.help"]'));
    expect(app.find('[data-test="pages-menu"]')).toBeNull();
    const sheet = app.find('[data-test="panel-notes.help"]');
    expect(sheet?.getAttribute('aria-label')).toBe('Help');
    expect(sheet?.textContent).toContain('Notes keep your thoughts.');
    expect(app.find('[data-test="panel-strip"]')).toBeNull();
    await click(app.find('[data-test="panel-close"]'));
    expect(app.find('[data-test="panel-notes.help"]')).toBeNull();

    await openMenu(app);
    await click(app.find('[data-test="pages-language"]'));
    expect(app.findAll('[data-test^="pages-language-"]').map((row) => row.dataset['test'])).toEqual(['pages-language-current', 'pages-language-en', 'pages-language-ar']);
    await click(app.find('[data-test="pages-language-ar"]'));
    expect(api.callsTo('kernel.settings.set').map((call) => call.input)).toEqual([{ key: 'kernel.language', value: 'ar', scope: 'global' }]);
    expect([document.documentElement.lang, document.documentElement.dir]).toEqual(['ar', 'rtl']);
    expect(app.find('[data-test="pages-menu"]')).toBeNull();
  });

  it('M4.7-H9 a pick of the open panel closes it', async () => {
    const app = await mountApp(notesApi(), '/notes/list?embed=parent');
    await openMenu(app);
    await click(app.find('[data-test="pages-panel-notes.help"]'));
    await openMenu(app);
    expect(app.find('[data-test="pages-panel-notes.help"]')?.getAttribute('aria-pressed')).toBe('true');
    await click(app.find('[data-test="pages-panel-notes.help"]'));
    expect(app.find('[data-test="panel-notes.help"]')).toBeNull();
  });
});
