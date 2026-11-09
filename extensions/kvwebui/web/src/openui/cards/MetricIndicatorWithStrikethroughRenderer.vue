<script setup lang="ts">
import type { ComponentRenderProps } from '@openuidev/vue-lang';
import type { MetricProps } from '../definitions/card-parts.ts';
import CardMetric from './CardMetric.vue';

// OpenUI's MetricIndicatorWithStrikethrough (plan 06 §6.1, ADR 0124, 16).
const component = defineProps<ComponentRenderProps<MetricProps>>();
</script>

<template>
  <CardMetric :metric="component.props" :inline="false" />
</template>
