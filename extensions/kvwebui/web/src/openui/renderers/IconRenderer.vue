<script setup lang="ts">
import type { ComponentRenderProps } from '@openuidev/vue-lang';
import type { IconProps } from '../definitions/data-display.ts';
import OpenuiIcon from './OpenuiIcon.vue';

// OpenUI's Icon (plan 06 §6.1, ADR 0124, 8): a Lucide icon by name, or its category's fallback, or `circle-dot`.
const component = defineProps<ComponentRenderProps<IconProps>>();
</script>

<template>
  <OpenuiIcon :name="component.props.name" :category="component.props.category" />
</template>
