import type { Json, Manifest, Message, Translations } from '@kvman/protocol';
import type { Ctx } from '@kvman/sdk';
import IntlMessageFormat, { FormatError } from 'intl-messageformat';
import { fallbackChain, messageAt } from '../../i18n/catalogs.ts';
import { parseMessage } from '../../i18n/icu-messages.ts';
import { hostProblem } from './host-problems.ts';
import type { InvocationState } from './invocation-state.ts';

type Primitive = string | number | boolean | null;

function values(message: Message, key: string, params: Record<string, Json> | undefined): Record<string, Primitive> {
  const primitives: Record<string, Primitive> = {};
  for (const [name, value] of Object.entries(params ?? {})) {
    if (value !== null && typeof value === 'object') {
      throw hostProblem(message, 'VALIDATION_FAILED', `the parameter ${name} of ${key} is not a string, number, boolean, or null`, [{ path: `params.${name}`, message: 'expected a string, number, boolean, or null' }]);
    }
    primitives[name] = value;
  }
  return primitives;
}

// ADR 0161: the extension's own message in `ctx.locale` along the fallback chain, formatted as plain text; a
// missing key or parameter fails like other misuse of ctx.
function translate(manifest: Manifest, message: Message, locale: string, key: string, params: Record<string, Json> | undefined): string {
  const translations: Translations | null = manifest.translations;
  const text = translations === null ? undefined : fallbackChain(translations, locale).map((chained) => messageAt(translations.catalogs[chained], key)).find((found) => found !== undefined);
  if (text === undefined) {
    throw hostProblem(message, 'VALIDATION_FAILED', `no catalog of ${manifest.meta.name} has the key ${key}`, [{ path: 'key', message: `${key} is not in the catalogs` }]);
  }
  const given = values(message, key, params);
  const parsed = parseMessage(text);
  const missing = parsed.ok ? [...parsed.parameters].filter((parameter) => !(parameter in given)) : [];
  if (missing.length > 0) {
    throw hostProblem(message, 'VALIDATION_FAILED', `${key} uses ${missing.map((parameter) => `{${parameter}}`).join(', ')}, which params does not pass`, missing.map((parameter) => ({ path: `params.${parameter}`, message: 'required by the message' })));
  }
  let formatted: unknown;
  try {
    formatted = new IntlMessageFormat(text, locale, undefined, { ignoreTag: true }).format(given);
  } catch (error) {
    if (error instanceof FormatError) throw hostProblem(message, 'VALIDATION_FAILED', `${key} cannot be formatted with these parameters`);
    throw error;
  }
  if (typeof formatted !== 'string') throw hostProblem(message, 'INTERNAL', `${key} did not format to plain text`);
  return formatted;
}

// ctx.locale and ctx.i18n (05 §5.4): the language of the person who started the chain, and the extension's own text
// in it for text that leaves kvman.
export function createText(state: InvocationState, manifest: Manifest): Pick<Ctx, 'locale' | 'i18n'> {
  const { message } = state.invoke;
  const locale = message.context['locale'];
  if (locale === undefined) throw hostProblem(message, 'INTERNAL', 'the message has no locale');
  return {
    locale,
    i18n: {
      t: (key, params) => {
        state.open();
        return translate(manifest, message, locale, key, params);
      },
    },
  };
}
