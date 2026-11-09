<script setup lang="ts">
import type { ComponentRenderProps } from '@openuidev/vue-lang';
import { computed } from 'vue';
import type { CheckBoxGroupProps } from '../definitions/forms.ts';
import { emptyValue, useField, useFormField } from '../fields.ts';
import { useOpenuiLive } from '../presses.ts';

// OpenUI's CheckBoxGroup (plan 06 §6.1, ADR 0124, 14, 16): checkboxes stored as `{ <item name>: checked }`, each item
// starting at its `defaultChecked`; a message reads the checked items' labels.
const component = defineProps<ComponentRenderProps<CheckBoxGroupProps>>();
const live = useOpenuiLive();
const items = computed(() => (component.props.items ?? []).map((item) => item.props));
const field = useField('CheckBoxGroup', () => component.props.name, () => component.props.value);
const checked = computed<Record<string, boolean>>(() => {
  const stored = field.value.value;
  const record = typeof stored === 'object' && stored !== null ? stored : {};
  return Object.fromEntries(items.value.map((item) => {
    const value: unknown = Reflect.get(record, item.name);
    return [item.name, typeof value === 'boolean' ? value : (item.defaultChecked ?? false)];
  }));
});
const describe = (): string => {
  const labels = items.value.filter((item) => checked.value[item.name] === true).map((item) => item.label);
  return labels.length === 0 ? emptyValue : labels.join(', ');
};
const check = useFormField(() => component.props.name, () => component.props.rules, () => checked.value, describe);

function toggle(name: string, event: Event): void {
  if (!(event.target instanceof HTMLInputElement)) return;
  const next = { ...checked.value, [name]: event.target.checked };
  field.set(next);
  check.validate(next);
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <label v-for="item in items" :key="item.name" class="flex items-start gap-2 text-sm">
      <input type="checkbox" class="mt-0.5 accent-[var(--kv-color-primary)]" :checked="checked[item.name]" :disabled="!live" @change="toggle(item.name, $event)" />
      <span class="flex flex-col">
        <span dir="auto">{{ item.label }}</span>
        <span v-if="item.description !== ''" dir="auto" class="text-xs text-muted">{{ item.description }}</span>
      </span>
    </label>
  </div>
</template>
