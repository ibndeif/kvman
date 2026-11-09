<script setup lang="ts">
import type { ComponentRenderProps } from '@openuidev/vue-lang';
import { computed } from 'vue';
import type { SwitchGroupProps } from '../definitions/forms.ts';
import { useField } from '../fields.ts';
import { useOpenuiLive } from '../presses.ts';

// OpenUI's SwitchGroup (plan 06 §6.1, ADR 0124, 16): switches stored as `{ <item name>: on }`, each starting at its
// `defaultChecked`, in a clear, card, or sunk container.
const component = defineProps<ComponentRenderProps<SwitchGroupProps>>();
const live = useOpenuiLive();
const variants = { clear: '', card: 'rounded-xl border border-line bg-surface p-3', sunk: 'rounded-xl bg-sunken p-3' };
const items = computed(() => (component.props.items ?? []).map((item) => item.props));
const field = useField('SwitchGroup', () => component.props.name, () => component.props.value);
const on = computed<Record<string, boolean>>(() => {
  const stored = field.value.value;
  const record = typeof stored === 'object' && stored !== null ? stored : {};
  return Object.fromEntries(items.value.map((item) => {
    const value: unknown = Reflect.get(record, item.name);
    return [item.name, typeof value === 'boolean' ? value : (item.defaultChecked ?? false)];
  }));
});

function toggle(name: string): void {
  if (!live.value) return;
  field.set({ ...on.value, [name]: on.value[name] !== true });
}
</script>

<template>
  <div class="flex flex-col gap-3" :class="variants[component.props.variant ?? 'clear']">
    <div v-for="item in items" :key="item.name" class="flex items-center justify-between gap-3 text-sm">
      <span class="flex flex-col">
        <span v-if="item.label !== undefined" dir="auto">{{ item.label }}</span>
        <span v-if="item.description !== undefined" dir="auto" class="text-xs text-muted">{{ item.description }}</span>
      </span>
      <button
        type="button"
        role="switch"
        :aria-checked="on[item.name] === true"
        :aria-label="item.label ?? item.name"
        :disabled="!live"
        class="relative h-5 w-9 shrink-0 rounded-full border-0 p-0 disabled:opacity-50"
        :class="on[item.name] === true ? 'bg-primary' : 'bg-line'"
        @click="toggle(item.name)"
      >
        <span class="absolute top-0.5 size-4 rounded-full bg-surface transition-[inset-inline-start]" :class="on[item.name] === true ? 'start-[1.125rem]' : 'start-0.5'" />
      </button>
    </div>
  </div>
</template>
