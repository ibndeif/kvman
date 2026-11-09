<script setup lang="ts">
import type { ComponentRenderProps } from '@openuidev/vue-lang';
import { computed } from 'vue';
import type { OptionCardsProps } from '../definitions/forms.ts';
import { chosenLabels, useField, useFormField } from '../fields.ts';
import { useOpenuiLive } from '../presses.ts';
import { selectionOf, storedSelection, toggledSelection } from '../selection.ts';
import OpenuiIcon from './OpenuiIcon.vue';
import OpenuiImage from './OpenuiImage.vue';

// OpenUI's OptionCards (plan 06 §6.1, ADR 0124, 14, 16): a grid of selectable cards, one or several chosen, starting at
// `defaultValue`; each may show an Icon or an Image on top. A message reads the chosen cards' titles.
const component = defineProps<ComponentRenderProps<OptionCardsProps>>();
const live = useOpenuiLive();
const type = computed(() => component.props.type ?? 'single');
const items = computed(() => (component.props.items ?? []).map((item) => item.props));
const field = useField('OptionCards', () => component.props.name, () => undefined);
const selection = computed(() => selectionOf(type.value, field.value.value, component.props.defaultValue));
const labels = computed(() => items.value.map((item) => ({ value: item.value, label: item.title })));
const check = useFormField(() => component.props.name, () => component.props.rules, () => storedSelection(type.value, selection.value), () => chosenLabels(labels.value, selection.value));

function press(value: string): void {
  if (!live.value) return;
  const next = storedSelection(type.value, toggledSelection(type.value, selection.value, value));
  field.set(next);
  check.validate(next);
}
</script>

<template>
  <div class="grid grid-cols-2 gap-2 sm:grid-cols-3" :role="type === 'single' ? 'radiogroup' : 'group'">
    <button
      v-for="item in items"
      :key="item.value"
      type="button"
      :aria-pressed="selection.includes(item.value)"
      :disabled="!live || item.disabled === true"
      class="flex flex-col items-start gap-2 rounded-xl border p-3 text-start disabled:opacity-50"
      :class="selection.includes(item.value) ? 'border-primary bg-accent-soft text-accent-ink' : 'border-line bg-surface text-ink'"
      @click="press(item.value)"
    >
      <template v-if="item.topContent !== undefined">
        <OpenuiIcon v-if="'name' in item.topContent.props" class="text-xl" :name="item.topContent.props.name" :category="item.topContent.props.category" />
        <OpenuiImage v-else class="h-20 w-full" :src="item.topContent.props.src ?? ''" :alt="item.topContent.props.alt" />
      </template>
      <span dir="auto" class="font-medium">{{ item.title }}</span>
      <span v-if="item.subtitle !== undefined" dir="auto" class="text-xs text-muted">{{ item.subtitle }}</span>
    </button>
  </div>
</template>
