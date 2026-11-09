<script setup lang="ts">
import type { ComponentRenderProps } from '@openuidev/vue-lang';
import type { TagBlockProps } from '../definitions/data-display.ts';

// OpenUI's TagBlock (plan 06 §6.1, ADR 0124, 16): plain strings as tags, each taking its direction from its text.
const component = defineProps<ComponentRenderProps<TagBlockProps>>();
const sizes = { sm: 'px-2 py-0.5 text-xs', md: 'px-2.5 py-1 text-sm', lg: 'px-3 py-1 text-base' };
</script>

<template>
  <ul class="m-0 flex list-none flex-wrap gap-2 p-0">
    <li v-for="(tag, index) in component.props.tags" :key="index" dir="auto" class="rounded-full bg-neutral-soft text-neutral-ink" :class="sizes[component.props.size ?? 'md']">
      {{ tag }}
    </li>
  </ul>
</template>
