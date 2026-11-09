<script setup lang="ts">
import type { ComponentRenderProps } from '@openuidev/vue-lang';
import { computed, useId } from 'vue';
import type { RadioGroupProps } from '../definitions/forms.ts';
import { chosenLabels, useField, useFormField } from '../fields.ts';
import { useOpenuiLive } from '../presses.ts';

// OpenUI's RadioGroup (plan 06 §6.1, ADR 0124, 14, 16): one choice of its items, starting at `defaultValue`; a message
// reads the chosen label.
const component = defineProps<ComponentRenderProps<RadioGroupProps>>();
const live = useOpenuiLive();
const group = useId();
const items = computed(() => (component.props.items ?? []).map((item) => item.props));
const field = useField('RadioGroup', () => component.props.name, () => component.props.value);
const chosen = computed(() => (typeof field.value.value === 'string' ? field.value.value : (component.props.defaultValue ?? '')));
const check = useFormField(() => component.props.name, () => component.props.rules, () => chosen.value, () => chosenLabels(items.value, [chosen.value]));

function choose(value: string): void {
  field.set(value);
  check.validate(value);
}
</script>

<template>
  <div role="radiogroup" class="flex flex-col gap-2">
    <label v-for="item in items" :key="item.value" class="flex items-start gap-2 text-sm">
      <input type="radio" class="mt-0.5 accent-[var(--kv-color-primary)]" :name="group" :value="item.value" :checked="chosen === item.value" :disabled="!live" @change="choose(item.value)" />
      <span class="flex flex-col">
        <span dir="auto">{{ item.label }}</span>
        <span v-if="item.description !== ''" dir="auto" class="text-xs text-muted">{{ item.description }}</span>
      </span>
    </label>
  </div>
</template>
