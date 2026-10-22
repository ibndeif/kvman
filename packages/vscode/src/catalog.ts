import arabic from '../locales/ar.json' with { type: 'json' };
import english from '../locales/en.json' with { type: 'json' };

// The extension's own text (plan 15 §15.7): Arabic when VS Code's display language is Arabic, otherwise English.

export type Language = 'en' | 'ar';
export type TextKey = keyof typeof english;
export type Translate = (key: TextKey, params?: Record<string, string>) => string;

const catalogs: Record<Language, Record<TextKey, string>> = { en: english, ar: arabic };

export function languageOf(displayLanguage: string): Language {
  return displayLanguage === 'ar' || displayLanguage.startsWith('ar-') ? 'ar' : 'en';
}

export function translator(language: Language): Translate {
  return (key, params = {}) => catalogs[language][key].replace(/\{(\w+)\}/g, (placeholder, name: string) => params[name] ?? placeholder);
}

function isTextKey(key: string): key is TextKey {
  return Object.hasOwn(english, key);
}

/** The hint for a failed start's code: one of the four the desktop app has, otherwise the log's place. */
export function hintKey(code: string): TextKey {
  const key = `vscode.failed.hint.${code}`;
  return isTextKey(key) ? key : 'vscode.failed.hint.other';
}
