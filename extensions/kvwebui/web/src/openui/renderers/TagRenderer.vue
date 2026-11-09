<script setup lang="ts">
import type { ComponentRenderProps } from '@openuidev/vue-lang';
import type { TagProps } from '../definitions/data-display.ts';
import OpenuiIcon from './OpenuiIcon.vue';

// OpenUI's Tag (plan 06 §6.1, ADR 0124, 16): a soft pill with an optional icon, three sizes, and five tones.
const component = defineProps<ComponentRenderProps<TagProps>>();
const sizes = { sm: 'px-2 py-0.5 text-xs', md: 'px-2.5 py-1 text-sm', lg: 'px-3 py-1 text-base' };
const variants = {
  neutral: 'bg-neutral-soft text-neutral-ink',
  info: 'bg-accent-soft text-accent-ink',
  success: 'bg-success-soft text-success-ink',
  warning: 'bg-warning-soft text-warning-ink',
  danger: 'bg-danger-soft text-danger-ink',
};
</script>

<template>
  <span dir="auto" class="inline-flex items-center gap-1 rounded-full" :class="[sizes[component.props.size ?? 'md'], variants[component.props.variant ?? 'neutral']]">
    <OpenuiIcon v-if="component.props.icon !== undefined" :name="component.props.icon.props.name" :category="component.props.icon.props.category" />
    <span>{{ component.props.text }}</span>
  </span>
</template>
