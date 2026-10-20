import { useI18n } from 'vue-i18n';
import { countParam, textParams, type Scope } from '../contributions/references.ts';
import type { Values } from '../contributions/views.ts';

export type ViewText = (text: string, values: Values | undefined, scope: Scope, language?: string) => string;

/** Translates a contributed text with its params; a numeric `count` chooses its plural form (ADR 0098, 1). */
export function useViewText(): ViewText {
  const { t } = useI18n();
  return (text, values, scope, language) => {
    const params = textParams(values, scope, language);
    const count = countParam(values, scope);
    return count === undefined ? t(text, params) : t(text, params, count);
  };
}
