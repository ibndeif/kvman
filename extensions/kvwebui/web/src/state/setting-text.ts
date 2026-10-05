import type { SettingInfo } from '../api/kernel.ts';

// What the Settings page calls a setting (plan 06 §6.6): `<key>.title`, else the key, and `<key>.description`, else
// the English description. The search box looks in both, and in the key (ADR 0013, 6).

export type Translator = { t: (key: string) => string; te: (key: string) => boolean };

export function settingTitle({ t, te }: Translator, setting: SettingInfo): string {
  return te(`${setting.key}.title`) ? t(`${setting.key}.title`) : setting.key;
}

export function settingDescription({ t, te }: Translator, setting: SettingInfo): string {
  return te(`${setting.key}.description`) ? t(`${setting.key}.description`) : setting.description;
}

/** Whether a setting's title, description, or key holds the search text, ignoring case. */
export function settingMatches(translator: Translator, setting: SettingInfo, search: string): boolean {
  const wanted = search.trim().toLowerCase();
  if (wanted === '') return true;
  return [settingTitle(translator, setting), settingDescription(translator, setting), setting.key].some((text) => text.toLowerCase().includes(wanted));
}
