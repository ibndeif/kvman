<script setup lang="ts">
import type { ComponentRenderProps } from '@openuidev/vue-lang';
import { computed, inject } from 'vue';
import type { DatePickerProps } from '../definitions/forms.ts';
import { emptyValue, fieldIdKey, useField, useFormField } from '../fields.ts';
import { useOpenuiLive } from '../presses.ts';
import { textControlClass } from './control-style.ts';

// OpenUI's DatePicker (plan 06 §6.1, ADR 0124, 14, 16): the browser's date input, or two of them for a range stored as
// `{ from, to }`; a message reads the date, or the range as `<start> – <end>`.
type Range = { from: string; to: string };
const component = defineProps<ComponentRenderProps<DatePickerProps>>();
const live = useOpenuiLive();
const id = inject(fieldIdKey, undefined);
const ranged = computed(() => component.props.mode === 'range');
const field = useField('DatePicker', () => component.props.name, () => component.props.value);
const single = computed(() => (typeof field.value.value === 'string' ? field.value.value : ''));
const range = computed<Range>(() => {
  const stored = field.value.value;
  const part = (key: 'from' | 'to'): string => {
    const value: unknown = typeof stored === 'object' && stored !== null && key in stored ? Reflect.get(stored, key) : undefined;
    return typeof value === 'string' ? value : '';
  };
  return { from: part('from'), to: part('to') };
});
const effective = (): unknown => (ranged.value ? (range.value.from === '' && range.value.to === '' ? undefined : range.value) : single.value);
const describe = (): string => {
  if (!ranged.value) return single.value === '' ? emptyValue : single.value;
  return range.value.from === '' && range.value.to === '' ? emptyValue : `${range.value.from} – ${range.value.to}`;
};
const check = useFormField(() => component.props.name, () => component.props.rules, effective, describe);

function set(value: unknown): void {
  field.set(value);
  check.validate(value);
}

function change(event: Event, part?: keyof Range): void {
  if (!(event.target instanceof HTMLInputElement)) return;
  set(part === undefined ? event.target.value : { ...range.value, [part]: event.target.value });
}
</script>

<template>
  <div v-if="ranged" class="flex flex-wrap items-center gap-2">
    <input :id="id" type="date" :value="range.from" :disabled="!live" :class="textControlClass" class="w-auto" @input="change($event, 'from')" />
    <span aria-hidden="true">–</span>
    <input type="date" :value="range.to" :disabled="!live" :class="textControlClass" class="w-auto" @input="change($event, 'to')" />
  </div>
  <input v-else :id="id" type="date" :name="component.props.name" :value="single" :disabled="!live" :class="textControlClass" class="w-auto" @input="change($event)" />
</template>
