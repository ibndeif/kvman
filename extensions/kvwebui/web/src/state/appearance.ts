import { kernelCommand } from '../api/kernel.ts';
import type { I18nState } from './i18n.ts';
import { settingValue, type Kvwebui } from './kvwebui.ts';
import { reloadSettings } from './workspaces.ts';

// The language and the theme (plan 06 §6.2, §2.11). Both are global settings: the language menu sets `kernel.language`,
// and the theme menu sets `kvwebui.theme`.

export type Theme = 'system' | 'light' | 'dark';

const rightToLeft = new Set(['ar', 'he', 'fa', 'ur']);

export function directionOf(language: string): 'rtl' | 'ltr' {
  return rightToLeft.has(language.split('-')[0]?.toLowerCase() ?? '') ? 'rtl' : 'ltr';
}

export async function applyLanguage(state: Kvwebui, i18n: I18nState, language: string): Promise<void> {
  i18n.use(language, await state.api.catalog(language));
  state.language.value = language;
  document.documentElement.lang = language;
  document.documentElement.dir = directionOf(language);
}

export async function setLanguage(state: Kvwebui, i18n: I18nState, language: string): Promise<void> {
  await kernelCommand(state.api, 'kernel.settings.set', { key: 'kernel.language', value: language, scope: 'global' });
  await applyLanguage(state, i18n, language);
  await reloadSettings(state);
}

export function currentTheme(state: Kvwebui): Theme {
  const theme = settingValue(state, 'kvwebui.theme');
  return theme === 'light' || theme === 'dark' ? theme : 'system';
}

export function applyTheme(state: Kvwebui): void {
  const theme = currentTheme(state);
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

export async function setTheme(state: Kvwebui, theme: Theme): Promise<void> {
  await kernelCommand(state.api, 'kernel.settings.set', { key: 'kvwebui.theme', value: theme, scope: 'global' });
  await reloadSettings(state);
  applyTheme(state);
}

// The language's name in itself: `العربية` for `ar`.
export function languageName(language: string): string {
  return new Intl.DisplayNames([language], { type: 'language' }).of(language) ?? language;
}
