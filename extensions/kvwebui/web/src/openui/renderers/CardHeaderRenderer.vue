<script setup lang="ts">
import type { ComponentRenderProps } from '@openuidev/vue-lang';
import type { CardHeaderProps } from '../definitions/content.ts';

// OpenUI's CardHeader (plan 06 §6.1, ADR 0124, 16): an optional title and subtitle, each taking its direction from its text.
const component = defineProps<ComponentRenderProps<CardHeaderProps>>();
</script>

<template>
  <header class="flex flex-col gap-1">
    <h2 v-if="component.props.title !== undefined" dir="auto" class="m-0 text-base font-semibold">{{ component.props.title }}</h2>
    <p v-if="component.props.subtitle !== undefined" dir="auto" class="m-0 text-sm text-muted">{{ component.props.subtitle }}</p>
  </header>
</template>
