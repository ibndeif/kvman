<script setup lang="ts">
import type { ComponentRenderProps } from '@openuidev/vue-lang';
import { computed } from 'vue';
import type { ChipsProps } from '../definitions/forms.ts';
import { chosenLabels, useField, useFormField } from '../fields.ts';
import { useOpenuiLive } from '../presses.ts';
import { selectionOf, storedSelection, toggledSelection } from '../selection.ts';
import OpenuiIcon from './OpenuiIcon.vue';

// OpenUI's Chips (plan 06 §6.1, ADR 0124, 14, 16): pressable chips choosing one or several values, starting at
// `defaultValue`; a message reads the chosen labels.
const component = defineProps<ComponentRenderProps<ChipsProps>>();
const live = useOpenuiLive();
const type = computed(() => component.props.type ?? 'multiple');
const items = computed(() => (component.props.items ?? []).map((item) => item.props));
const field = useField('Chips', () => component.props.name, () => undefined);
const selection = computed(() => selectionOf(type.value, field.value.value, component.props.defaultValue));
const check = useFormField(() => component.props.name, () => component.props.rules, () => storedSelection(type.value, selection.value), () => chosenLabels(items.value, selection.value));

function press(value: string): void {
  if (!live.value) return;
  const next = storedSelection(type.value, toggledSelection(type.value, selection.value, value));
  field.set(next);
  check.validate(next);
}
</script>

<template>
  <div class="flex flex-wrap gap-2">
    <button
      v-for="item in items"
      :key="item.value"
      type="button"
      :aria-pressed="selection.includes(item.value)"
      :disabled="!live || item.disabled === true"
      class="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm disabled:opacity-50"
      :class="selection.includes(item.value) ? 'border-primary bg-accent-soft text-accent-ink' : 'border-line bg-surface text-ink'"
      @click="press(item.value)"
    >
      <OpenuiIcon v-if="item.icon !== undefined" :name="item.icon.props.name" :category="item.icon.props.category" />
      <span dir="auto">{{ item.label }}</span>
    </button>
  </div>
</template>
