import { builtInValidators, type ParsedRule } from '@openuidev/lang-core';
import type { FormValidationContextValue } from '@openuidev/vue-lang';
import { reactive } from 'vue';

// A form's validation (plan 06 §6.1, ADR 0124, 14 and 15): OpenUI's rules, checked by lang-core's own validators, with
// each error a kvwebui text in the page's language instead of lang-core's English.

export type RuleText = (key: string, params: Record<string, string | number>) => string;

const ruleKeys: Readonly<Record<string, string>> = {
  required: 'kvwebui.openui.rules.required',
  email: 'kvwebui.openui.rules.email',
  url: 'kvwebui.openui.rules.url',
  numeric: 'kvwebui.openui.rules.numeric',
  min: 'kvwebui.openui.rules.min',
  max: 'kvwebui.openui.rules.max',
  minLength: 'kvwebui.openui.rules.minLength',
  maxLength: 'kvwebui.openui.rules.maxLength',
  pattern: 'kvwebui.openui.rules.pattern',
};

// A group of checkboxes or switches is a record of booleans; `required` asks for at least one of them.
function noOptionChosen(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const values = Object.values(value);
  return values.length > 0 && values.every((option) => option === false);
}

/** The text of the first rule `value` breaks, or `undefined` when it keeps them all. */
export function ruleError(value: unknown, rules: readonly ParsedRule[], text: RuleText): string | undefined {
  for (const rule of rules) {
    const validator = builtInValidators[rule.type];
    const key = ruleKeys[rule.type];
    if (validator === undefined || key === undefined) continue;
    if (validator(value, rule.arg) === undefined) continue;
    if (rule.type === 'required' && noOptionChosen(value)) return text('kvwebui.openui.rules.requiredOption', {});
    return text(key, rule.arg === undefined ? {} : { value: rule.arg });
  }
  return undefined;
}

/** A form's validation context, as vue-lang's `FormValidationContextValue`, with translated errors. */
export function createFormValidation(text: RuleText): FormValidationContextValue {
  const errors = reactive<Record<string, string | undefined>>({});
  const fields = new Map<string, { rules: ParsedRule[]; getValue: () => unknown }>();
  const validateField = (name: string, value: unknown, rules: ParsedRule[]): boolean => {
    const error = ruleError(value, rules, text);
    errors[name] = error;
    return error === undefined;
  };
  return {
    errors,
    validateField,
    registerField: (name, rules, getValue) => {
      fields.set(name, { rules, getValue });
    },
    unregisterField: (name) => {
      fields.delete(name);
      errors[name] = undefined;
    },
    validateForm: () => [...fields].map(([name, field]) => validateField(name, field.getValue(), field.rules)).every(Boolean),
    clearFieldError: (name) => {
      errors[name] = undefined;
    },
  };
}
