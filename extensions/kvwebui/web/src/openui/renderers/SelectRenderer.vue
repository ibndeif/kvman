<script setup lang="ts">
import type { ComponentRenderProps } from '@openuidev/vue-lang';
import { computed, inject } from 'vue';
import type { SelectProps } from '../definitions/forms.ts';
import { chosenLabels, fieldIdKey, useField, useFormField } from '../fields.ts';
import { useOpenuiLive } from '../presses.ts';
import { textControlClass } from './control-style.ts';

// OpenUI's Select (plan 06 §6.1, ADR 0124, 14, 16): the browser's select of its items; a message reads the chosen label.
const component = defineProps<ComponentRenderProps<SelectProps>>();
const live = useOpenuiLive();
const id = inject(fieldIdKey, undefined);
const sizes = { small: 'text-xs', medium: 'text-sm', large: 'text-base' };
const items = computed(() => (component.props.items ?? []).map((item) => item.props));
const field = useField('Select', () => component.props.name, () => component.props.value);
const chosen = computed(() => (typeof field.value.value === 'string' ? field.value.value : ''));
const check = useFormField(() => component.props.name, () => component.props.rules, () => chosen.value, () => chosenLabels(items.value, [chosen.value]));

function change(event: Event): void {
  if (!(event.target instanceof HTMLSelectElement)) return;
  field.set(event.target.value);
  check.validate(event.target.value);
}
</script>

<template>
  <select :id="id" :name="component.props.name" :value="chosen" :disabled="!live" :class="[textControlClass, sizes[component.props.size ?? 'medium']]" @change="change">
    <option value="" disabled>{{ component.props.placeholder ?? '' }}</option>
    <option v-for="item in items" :key="item.value" :value="item.value">{{ item.label }}</option>
  </select>
</template>
