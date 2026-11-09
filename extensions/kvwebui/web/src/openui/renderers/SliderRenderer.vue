<script setup lang="ts">
import type { ComponentRenderProps } from '@openuidev/vue-lang';
import { computed, inject } from 'vue';
import type { SliderProps } from '../definitions/forms.ts';
import { emptyValue, fieldIdKey, useField, useFormField } from '../fields.ts';
import { useOpenuiLive } from '../presses.ts';

// OpenUI's Slider (plan 06 §6.1, ADR 0124, 14, 16): one thumb, or two for a range when its value or default has two
// numbers; continuous steps by `step` (or freely), discrete by `step` (or 1). A message reads `<low> – <high>`.
const component = defineProps<ComponentRenderProps<SliderProps>>();
const live = useOpenuiLive();
const id = inject(fieldIdKey, undefined);
const field = useField('Slider', () => component.props.name, () => component.props.value);
const values = computed<number[]>(() => {
  const stored = field.value.value;
  if (Array.isArray(stored) && stored.every((value) => typeof value === 'number')) return stored;
  return component.props.defaultValue ?? [component.props.min];
});
const step = computed(() => component.props.step ?? (component.props.variant === 'discrete' ? 1 : 'any'));
const describe = (): string => (values.value.length === 0 ? emptyValue : values.value.join(' – '));
const check = useFormField(() => component.props.name, () => component.props.rules, () => values.value[0], describe);

function change(event: Event, index: number): void {
  if (!(event.target instanceof HTMLInputElement)) return;
  const moved = Number(event.target.value);
  const next = values.value.map((value, position) => (position === index ? moved : value));
  field.set(next);
  check.validate(next[0]);
}
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <div class="flex items-center justify-between gap-2 text-sm">
      <span dir="auto" class="text-muted">{{ component.props.label ?? '' }}</span>
      <span dir="ltr" class="font-medium tabular-nums">{{ values.join(' – ') }}</span>
    </div>
    <input
      v-for="(value, index) in values"
      :id="index === 0 ? id : undefined"
      :key="index"
      type="range"
      :min="component.props.min"
      :max="component.props.max"
      :step="step"
      :value="value"
      :disabled="!live"
      class="w-full accent-[var(--kv-color-primary)] disabled:opacity-50"
      @input="change($event, index)"
    />
  </div>
</template>
