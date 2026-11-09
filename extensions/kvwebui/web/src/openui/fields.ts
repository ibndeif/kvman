import { isReactiveAssign, type ParsedRule } from '@openuidev/lang-core';
import { parseStructuredRules, useFormName, useFormValidation, useOpenUI } from '@openuidev/vue-lang';
import { computed, inject, onUnmounted, shallowRef, watch, type ComputedRef, type InjectionKey } from 'vue';
import type { RulesProps } from './definitions/forms.ts';

// A form control's value (plan 06 §6.1, ADR 0124, 14): a control bound to a `$variable` reads and writes that variable;
// any other keeps its value in its form's state (or the block's, outside a form). OpenUI's store isn't reactive in Vue,
// so a control re-reads it on every change. Each control registers how its value reads in a press's message, and its
// rules with the form's validation.

/** What a form knows of each of its controls, by the control's name: how its value reads in a message. */
export const formFieldsKey: InjectionKey<Map<string, () => string>> = Symbol('kvwebui-openui-form-fields');

/** The id a FormControl's label points at, given to the control inside it. */
export const fieldIdKey: InjectionKey<string> = Symbol('kvwebui-openui-field-id');

/** The text of a value nothing was typed or chosen for. */
export const emptyValue = '(empty)';

export type Field = {
  /** The stored value, `undefined` until the person sets one. */
  value: ComputedRef<unknown>;
  set(value: unknown): void;
};

/** A control's field: `name` is its form field, `binding` its `value` prop, `$variable` or not. */
export function useField(componentType: string, name: () => string, binding: () => unknown): Field {
  const openui = useOpenUI();
  const formName = useFormName();
  const version = shallowRef(0);
  const stop = openui.store.subscribe(() => {
    version.value += 1;
  });
  onUnmounted(stop);
  const target = computed(() => {
    const bound = binding();
    return isReactiveAssign(bound) ? bound.target : undefined;
  });
  const value = computed(() => {
    void version.value;
    return target.value === undefined ? openui.getFieldValue(formName?.value, name()) : openui.store.get(target.value);
  });
  const set = (next: unknown): void => {
    if (target.value !== undefined) openui.store.set(target.value, next);
    else openui.setFieldValue(formName?.value, componentType, name(), next, true);
  };
  return { value, set };
}

/** Registers a control with its form: how its value reads in a message, and its rules with the form's validation. */
export function useFormField(name: () => string, rules: () => RulesProps, effective: () => unknown, describe: () => string): { validate(value: unknown): void } {
  const fields = inject(formFieldsKey, undefined);
  const validation = useFormValidation();
  const parsed = computed<ParsedRule[]>(() => parseStructuredRules(rules()));
  watch(
    [name, parsed],
    ([current, list], previous) => {
      const old = previous?.[0];
      if (old !== undefined) {
        fields?.delete(old);
        validation?.unregisterField(old);
      }
      fields?.set(current, describe);
      if (list.length > 0) validation?.registerField(current, list, effective);
    },
    { immediate: true },
  );
  onUnmounted(() => {
    fields?.delete(name());
    validation?.unregisterField(name());
  });
  return {
    validate: (value) => {
      if (parsed.value.length > 0) validation?.validateField(name(), value, parsed.value);
    },
  };
}

/** The labels of the chosen items, joined, or the empty text. */
export function chosenLabels(items: readonly { value: string; label: string }[], chosen: readonly string[]): string {
  const labels = items.filter((item) => chosen.includes(item.value)).map((item) => item.label);
  return labels.length === 0 ? emptyValue : labels.join(', ');
}

/** A typed text, or the empty text. */
export function typedText(value: unknown): string {
  return typeof value === 'string' && value !== '' ? value : emptyValue;
}
