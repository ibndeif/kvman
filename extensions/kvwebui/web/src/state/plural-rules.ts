import type { PluralizationRule } from 'vue-i18n';

// A text's plural forms (plan 02 §2.11, ADR 0098, 1): one per plural category of its language, in this order.
const categoryOrder: readonly Intl.LDMLPluralRule[] = ['zero', 'one', 'two', 'few', 'many', 'other'];

/** vue-i18n's choice of a form for `language`; a text with no numeric `count` reaches it as -1 and shows its last form. */
export function pluralRule(language: string): PluralizationRule {
  const rules = new Intl.PluralRules(language);
  const shipped = rules.resolvedOptions().pluralCategories;
  const categories = categoryOrder.filter((category) => shipped.includes(category));
  return (choice, formCount, defaultRule) => {
    if (choice < 0) return formCount - 1;
    if (formCount !== categories.length) return defaultRule === undefined ? formCount - 1 : defaultRule(choice, formCount);
    return categories.indexOf(rules.select(choice));
  };
}
