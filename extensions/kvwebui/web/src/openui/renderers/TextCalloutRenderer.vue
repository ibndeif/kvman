<script setup lang="ts">
import type { ComponentRenderProps } from '@openuidev/vue-lang';
import type { TextCalloutProps } from '../definitions/content.ts';

// OpenUI's TextCallout (plan 06 §6.1, ADR 0124, 16): a soft banner with an optional bold title and plain description.
const component = defineProps<ComponentRenderProps<TextCalloutProps>>();
const variants = {
  neutral: 'border-neutral-soft bg-neutral-soft text-neutral-ink',
  info: 'border-accent-soft bg-accent-soft text-accent-ink',
  warning: 'border-warning-soft bg-warning-soft text-warning-ink',
  success: 'border-success-soft bg-success-soft text-success-ink',
  danger: 'border-danger-soft bg-danger-soft text-danger-ink',
};
</script>

<template>
  <aside class="rounded-xl border p-4" :class="variants[component.props.variant ?? 'neutral']" role="status">
    <p v-if="component.props.title !== undefined" dir="auto" class="m-0 font-semibold">{{ component.props.title }}</p>
    <p v-if="component.props.description !== undefined" dir="auto" class="m-0 text-sm" :class="component.props.title === undefined ? '' : 'mt-1'">{{ component.props.description }}</p>
  </aside>
</template>
