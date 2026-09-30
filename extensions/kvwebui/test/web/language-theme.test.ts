import { afterEach, describe, expect, it, vi } from 'vitest';
import { setting } from './support/fake-api.ts';
import { click, mountApp, type Mounted } from './support/mount-app.ts';
import { notesApi } from './support/notes.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

const openLanguages = (app: Mounted) => click(app.find('button[aria-label="Language"], button[aria-label="اللغة"]'));

describe('language and theme (06 §6.2, §2.11, ADR 0009, 75)', () => {
  it('M2.2-H7 switching the language re-renders the UI in it, and a setting without <key>.description shows its English one', async () => {
    const api = notesApi();
    api.settings.push(setting('notes.pageSize', { type: 'integer' }, ['global', 'workspace'], { default: 20 }));
    const app = await mountApp(api, '/notes/list');
    expect(app.find('[data-test="nav-kvwebui.settings"]')?.textContent).toBe('Settings');
    await openLanguages(app);
    await click(app.find('[data-test="language-ar"]'));
    expect(api.callsTo('kernel.settings.set').map((call) => call.input)).toEqual([{ key: 'kernel.language', value: 'ar', scope: 'global' }]);
    expect(app.find('[data-test="nav-kvwebui.settings"]')?.textContent).toBe('الإعدادات');
    expect([document.documentElement.lang, document.documentElement.dir]).toEqual(['ar', 'rtl']);
    await app.router.push('/kvwebui/settings');
    await app.settle();
    expect(app.find('[data-test="setting-notes.pageSize"] [data-test="setting-description"]')?.textContent).toBe('The English description of notes.pageSize.');
  });

  it('M2.2-E7 the theme follows kvwebui.theme and the system', async () => {
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({ matches: query === '(prefers-color-scheme: dark)', media: query, addEventListener: () => undefined, removeEventListener: () => undefined }) as never);
    const api = notesApi();
    const app = await mountApp(api, '/notes/list');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    const pick = async (theme: string) => {
      await click(app.find('button[aria-label^="Theme:"]'));
      await click(app.find(`[data-test="theme-${theme}"]`));
    };
    await pick('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    await pick('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(api.callsTo('kernel.settings.set').map((call) => call.input)).toEqual([
      { key: 'kvwebui.theme', value: 'light', scope: 'global' },
      { key: 'kvwebui.theme', value: 'dark', scope: 'global' },
    ]);
  });

  it('M2.2-E8 each language is named in itself, and ar, he, fa, and ur are right to left', async () => {
    const api = notesApi();
    const languages = ['en', 'ar', 'he', 'fa', 'ur', 'pt-BR'];
    api.languages = languages;
    for (const language of languages) api.catalogs[language] ??= api.catalogs['en'] ?? {};
    const app = await mountApp(api, '/notes/list');
    await openLanguages(app);
    const names = languages.map((language) => app.find(`[data-test="language-${language}"]`)?.textContent.trim());
    expect(names).toEqual(languages.map((language) => new Intl.DisplayNames([language], { type: 'language' }).of(language)));
    expect(names.slice(0, 3)).toEqual(['English', 'العربية', 'עברית']);
    const directions: string[] = [];
    for (const language of languages) {
      if (app.find('[role="menu"]') === null) await openLanguages(app);
      await click(app.find(`[data-test="language-${language}"]`));
      directions.push(document.documentElement.dir);
    }
    expect(directions).toEqual(['ltr', 'rtl', 'rtl', 'rtl', 'rtl', 'ltr']);
  });
});
