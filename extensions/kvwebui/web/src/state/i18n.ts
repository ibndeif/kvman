import { inject, type InjectionKey, type Plugin } from 'vue';
import { createI18n, type PluralizationRule } from 'vue-i18n';
import { pluralRule } from './plural-rules.ts';

// vue-i18n over the kernel's merged catalogs (plan 06 §6.1, §2.11). Catalog keys are flat (`kvai.ui.models.title`), so
// a key is looked up whole, never as a path. A key no catalog has shows as itself. A text's plural form follows its
// language's rule, added when the language is loaded (ADR 0098, 1).

export type I18nState = { plugin: Plugin; use(language: string, catalog: Record<string, string>): void };

export const i18nKey: InjectionKey<I18nState> = Symbol('kvwebui-i18n');

export function createI18nState(): I18nState {
  // vue-i18n keeps this object, not a copy, so a rule added here later is seen.
  const pluralRules: Record<string, PluralizationRule> = {};
  const i18n = createI18n({
    legacy: false,
    locale: 'en',
    fallbackLocale: false,
    missingWarn: false,
    fallbackWarn: false,
    messages: {},
    pluralRules,
    messageResolver: (messages: unknown, path: string) => {
      if (typeof messages !== 'object' || messages === null) return null;
      const message: unknown = Reflect.get(messages, path);
      return typeof message === 'string' ? message : null;
    },
  });
  return {
    plugin: i18n,
    use: (language, catalog) => {
      pluralRules[language] ??= pluralRule(language);
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
