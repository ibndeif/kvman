<script setup lang="ts">
import { useTriggerAction, type ActionConfig, type ComponentRenderProps } from '@openuidev/vue-lang';
import { computed } from 'vue';
import type { IconButtonProps } from '../definitions/buttons.ts';
import { useOpenuiLive } from '../presses.ts';
import OpenuiIcon from './OpenuiIcon.vue';

// OpenUI's IconButton (plan 06 §6.1, ADR 0124, 6, 14, 18): an icon-only button whose accessible name is also its action
// label, and which only presses while the block is live.
const component = defineProps<ComponentRenderProps<IconButtonProps>>();
const trigger = useTriggerAction();
const live = useOpenuiLive();
const variants = {
  primary: 'bg-primary text-on-primary',
  secondary: 'border border-line bg-surface text-ink',
  tertiary: 'border border-transparent bg-transparent text-primary',
};
const sizes = { 'extra-small': 'size-6 text-xs', small: 'size-8 text-sm', medium: 'size-9 text-base', large: 'size-11 text-lg' };
const shapes = { square: 'rounded-lg', circle: 'rounded-full' };
const variantClass = computed(() => variants[component.props.variant ?? 'secondary']);

function press(): void {
  if (!live.value) return;
  const action: ActionConfig | undefined = component.props.action;
  trigger(component.props.name, undefined, action);
}
</script>

<template>
  <button
    type="button"
    class="m-0 inline-grid place-items-center border disabled:opacity-50"
    :class="[variantClass, sizes[component.props.size ?? 'medium'], shapes[component.props.shape ?? 'square']]"
    :aria-label="component.props.name"
    :title="component.props.name"
    :disabled="!live"
    @click="press"
  >
    <OpenuiIcon :name="component.props.icon.props.name" :category="component.props.icon.props.category" />
  </button>
</template>
