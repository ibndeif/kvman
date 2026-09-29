import { catalogSchema, type Issue, type Translations } from '@kvman/protocol';
import { schemaIssues } from '../validation/schema-issues.ts';
import { catalogMessages, messageAt } from './catalogs.ts';
import { parseMessage, type ParsedMessage } from './icu-messages.ts';
import type { KeyUse } from './key-uses.ts';

// Who owns the catalogs a text rule reads: an extension (its manifest) or a preset.
export type TextOwner = { subject: string; register: string };

const icuHint = 'close every brace, and give every plural and select an other case';

type Parsed = ReadonlyMap<string, ReadonlyMap<string, ParsedMessage>>;

function parseCatalogs(translations: Translations): Parsed {
  return new Map(Object.entries(translations.catalogs).map(([locale, catalog]) => [
    locale, new Map(catalogMessages(catalog).map(([key, message]) => [key, parseMessage(message)])),
  ]));
}

// 06 §6.3, ADR 0160 rules 1–2: the default locale is shipped, and every message is valid ICU.
function catalogIssues(translations: Translations, parsed: Parsed): Issue[] {
  const defaultIssues: Issue[] = translations.catalogs[translations.default] === undefined
    ? [{ path: 'translations.default', message: `no catalog is shipped for the default locale ${translations.default}`, hint: `add a ${translations.default} catalog, or name a shipped locale as the default` }]
    : [];
  const invalid = [...parsed].flatMap(([locale, messages]) => [...messages].flatMap(([key, message]): Issue[] => (message.ok ? [] : [{
    path: `translations.catalogs.${locale}.${key}`, message: `the message is not valid ICU MessageFormat (${message.reason})`,
    hint: icuHint,
  }])));
  return [...defaultIssues, ...invalid];
}

function parameterIssues(use: KeyUse, parsed: Parsed, locales: readonly string[]): Issue[] {
  return locales.flatMap((locale): Issue[] => {
    const message = parsed.get(locale)?.get(use.key);
    if (message?.ok !== true) return [];
    const missing = [...message.parameters].filter((parameter) => !use.parameters.has(parameter));
    if (missing.length === 0) return [];
    return [{
      path: use.path, message: `${use.key} uses ${missing.map((parameter) => `{${parameter}}`).join(', ')} in ${locale}, which this text does not pass`,
      hint: `pass it: { "$t": "${use.key}", ${missing.map((parameter) => `"${parameter}": …`).join(', ')} }`,
    }];
  });
}

// ADR 0160 rules 3–4: every key use names a message of the default catalog (an error) and of the other shipped
// catalogs (a warning), and passes every parameter those messages use.
function useIssues(use: KeyUse, translations: Translations, parsed: Parsed): Issue[] {
  const others = Object.keys(translations.catalogs).filter((locale) => locale !== translations.default).sort();
  if (messageAt(translations.catalogs[translations.default], use.key) === undefined) {
    return [{ path: use.path, message: `${use.key} is not in the default catalog ${translations.default}`, hint: `add ${use.key} to the ${translations.default} catalog` }];
  }
  const absent = others.filter((locale) => messageAt(translations.catalogs[locale], use.key) === undefined).map((locale): Issue => ({
    path: use.path, message: `${use.key} is not in the ${locale} catalog; ${locale} shows the ${translations.default} text`, code: 'TRANSLATION_MISSING', severity: 'warning',
  }));
  return [...absent, ...parameterIssues(use, parsed, [translations.default, ...others])];
}

// The text rules of one owner's catalogs and the keys it writes.
export function textIssues(translations: Translations | null, uses: readonly KeyUse[], owner: TextOwner): Issue[] {
  if (translations === null) {
    return uses.map((use) => ({ path: use.path, message: `${use.key} is a translation key, but ${owner.subject} has no catalogs`, hint: owner.register }));
  }
  const parsed = parseCatalogs(translations);
  const catalogs = catalogIssues(translations, parsed);
  if (translations.catalogs[translations.default] === undefined) return catalogs;
  return [...catalogs, ...uses.flatMap((use) => useIssues(use, translations, parsed))];
}

// ADR 0160: `kernel.validate { catalog }` checks one language's catalog alone, its shape and its ICU.
export function catalogValidationIssues(candidate: unknown): Issue[] {
  const parsed = catalogSchema.safeParse(candidate);
  if (!parsed.success) return schemaIssues(parsed.error.issues).map((issue) => ({ ...issue, path: issue.path === '' ? 'catalog' : `catalog.${issue.path}` }));
  return catalogMessages(parsed.data).flatMap(([key, message]): Issue[] => {
    const checked = parseMessage(message);
    return checked.ok ? [] : [{ path: `catalog.${key}`, message: `the message is not valid ICU MessageFormat (${checked.reason})`, hint: icuHint }];
  });
}
