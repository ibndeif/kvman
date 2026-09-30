<script setup lang="ts">
import { CircleAlert } from '@lucide/vue';
import { computed, useId } from 'vue';
import { useI18n } from 'vue-i18n';
import type { Field } from '../../forms/fields.ts';
import type { FormValues } from '../../forms/values.ts';

// One generated field (ADR 0009, 70): its label is `<command>.fields.<path>`, or else its description, or its name. A
// `bare` field keeps its label for screen readers only, for a setting whose row already names it.
const props = defineProps<{ field: Field; command: string; values: FormValues; invalid: readonly string[]; set: (path: string, value: string | boolean) => void; bare?: boolean }>();
const { t, te } = useI18n();
const id = useId();
const labelKey = computed(() => `${props.command}.fields.${props.field.path}`);
const label = computed(() => (te(labelKey.value) ? t(labelKey.value) : (props.field.description ?? props.field.name)));
const bad = computed(() => props.invalid.includes(props.field.path.split('.')[0] ?? ''));
const text = computed(() => {
  const value = props.values[props.field.path];
  return typeof value === 'string' ? value : '';
});
const inputClass = computed(() => ['w-full rounded-xl border bg-surface px-3', bad.value ? 'border-danger ring-3 ring-danger-soft' : 'border-line']);
const optionText = (option: unknown): string => (typeof option === 'string' ? option : JSON.stringify(option));
const onText = (event: Event): void => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) props.set(props.field.path, event.target.value);
};
const onCheck = (event: Event): void => {
  if (event.target instanceof HTMLInputElement) props.set(props.field.path, event.target.checked);
};
</script>

<template>
  <fieldset v-if="props.field.kind === 'group'" class="m-0 flex flex-col gap-3 rounded-xl border border-line p-4">
    <legend class="px-1 font-medium">{{ label }}</legend>
    <FormField v-for="child in props.field.children ?? []" :key="child.path" :field="child" :command="props.command" :values="props.values" :invalid="props.invalid" :set="props.set" />
  </fieldset>
  <label v-else-if="props.field.kind === 'checkbox'" class="flex items-center gap-2.5" :data-field="props.field.path">
    <input type="checkbox" class="size-4 accent-primary" :checked="props.values[props.field.path] === true" @change="onCheck" />
    <span class="font-medium" :class="props.bare ? 'sr-only' : ''">{{ label }}</span>
  </label>
  <div v-else class="flex flex-col gap-1.5" :data-field="props.field.path" :data-invalid="bad" :data-required="props.field.required">
    <label :for="id" class="font-medium" :class="props.bare ? 'sr-only' : ''">{{ label }}<span v-if="props.field.required" class="text-danger" aria-hidden="true"> *</span></label>
    <select v-if="props.field.kind === 'select'" :id="id" :class="inputClass" class="h-10" :value="text" @change="onText">
      <option value="">{{ props.field.required ? '' : t('kvwebui.form.none') }}</option>
      <option v-for="option in props.field.options ?? []" :key="JSON.stringify(option)" :value="JSON.stringify(option)">{{ optionText(option) }}</option>
    </select>
    <textarea v-else-if="props.field.kind === 'lines' || props.field.kind === 'json'" :id="id" :class="inputClass" class="min-h-20 py-2 font-mono text-[13px]" :value="text" @input="onText" />
    <input
      v-else
      :id="id"
      :type="props.field.kind === 'password' ? 'password' : props.field.kind === 'number' ? 'number' : 'text'"
      :autocomplete="props.field.kind === 'password' ? 'off' : undefined"
      :class="inputClass"
      class="h-10"
      :value="text"
      @input="onText"
    />
    <span v-if="props.field.kind === 'lines'" class="text-xs text-muted">{{ t('kvwebui.form.onePerLine') }}</span>
    <span v-if="bad" class="flex items-center gap-1.5 text-[12.5px] text-danger" data-test="field-invalid"><CircleAlert class="size-3.5" aria-hidden="true" />{{ t('kvwebui.form.invalid') }}</span>
  </div>
</template>
