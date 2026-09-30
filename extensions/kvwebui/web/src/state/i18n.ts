import { inject, type InjectionKey, type Plugin } from 'vue';
import { createI18n } from 'vue-i18n';

// vue-i18n over the kernel's merged catalogs (plan 06 §6.1, §2.11). Catalog keys are flat (`kvai.ui.models.title`), so
// a key is looked up whole, never as a path. A key no catalog has shows as itself.

export type I18nState = { plugin: Plugin; use(language: string, catalog: Record<string, string>): void };

export const i18nKey: InjectionKey<I18nState> = Symbol('kvwebui-i18n');

export function createI18nState(): I18nState {
  const i18n = createI18n({
    legacy: false,
    locale: 'en',
    fallbackLocale: false,
    missingWarn: false,
    fallbackWarn: false,
    messages: {},
    messageResolver: (messages: unknown, path: string) => {
      if (typeof messages !== 'object' || messages === null) return null;
      const message: unknown = Reflect.get(messages, path);
      return typeof message === 'string' ? message : null;
    },
  });
  return {
    plugin: i18n,
    use: (language, catalog) => {
      i18n.global.setLocaleMessage(language, catalog);
      i18n.global.locale.value = language;
    },
  };
}

export function useI18nState(): I18nState {
  const i18n = inject(i18nKey);
  if (i18n === undefined) throw new Error('useI18nState() runs only inside the kvwebui app.');
  return i18n;
}
