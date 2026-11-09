<script setup lang="ts">
import type { ComponentRenderProps } from '@openuidev/vue-lang';
import type { InlineHeaderProps } from '../definitions/content.ts';

// OpenUI's InlineHeader (plan 06 §6.1, ADR 0124, 16): a compact heading with an optional one-line description.
const component = defineProps<ComponentRenderProps<InlineHeaderProps>>();
</script>

<template>
  <header class="flex flex-col gap-0.5">
    <p dir="auto" class="m-0 text-sm font-semibold">{{ component.props.heading }}</p>
    <p v-if="component.props.description !== undefined" dir="auto" class="m-0 text-xs text-muted">{{ component.props.description }}</p>
  </header>
</template>
