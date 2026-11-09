<script setup lang="ts">
import type { ComponentRenderProps } from '@openuidev/vue-lang';
import { computed } from 'vue';
import type { SeparatorProps } from '../definitions/layout-items.ts';

// OpenUI's Separator (plan 06 §6.1, ADR 0124, 16): a one-pixel rule across, or of the row's height, and decorative when
// the model says so.
const component = defineProps<ComponentRenderProps<SeparatorProps>>();
const orientation = computed(() => component.props.orientation ?? 'horizontal');
</script>

<template>
  <div
    :role="component.props.decorative === true ? undefined : 'separator'"
    :aria-hidden="component.props.decorative === true ? true : undefined"
    :aria-orientation="component.props.decorative === true ? undefined : orientation"
    :class="orientation === 'vertical' ? 'h-full w-px shrink-0 self-stretch bg-line' : 'h-px w-full bg-line'"
  />
</template>
