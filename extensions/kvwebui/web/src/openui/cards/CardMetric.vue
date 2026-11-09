<script setup lang="ts">
import { ArrowDown, ArrowUp } from '@lucide/vue';
import type { MetricProps } from '../definitions/card-parts.ts';

// OpenUI's metric indicators (plan 06 §6.1, ADR 0124, 16): a headline value, an optional struck-through previous value,
// a trend in percent (up green, down red), and a subtext, on one line or stacked. Numbers read left to right.
const props = defineProps<{ metric: MetricProps; inline: boolean }>();
</script>

<template>
  <span class="flex gap-x-2 gap-y-0.5" :class="props.inline ? 'flex-wrap items-baseline' : 'flex-col'">
    <span class="flex flex-wrap items-baseline gap-2" dir="ltr">
      <span class="font-semibold tabular-nums" :class="props.inline ? 'text-base' : 'text-2xl'">{{ props.metric.value }}</span>
      <s v-if="props.metric.previousValue !== undefined" class="text-sm text-muted tabular-nums">{{ props.metric.previousValue }}</s>
      <span v-if="props.metric.trend !== undefined" class="inline-flex items-center gap-0.5 text-xs font-medium tabular-nums" :class="props.metric.trend.direction === 'up' ? 'text-success-ink' : 'text-danger-ink'" data-test="metric-trend">
        <ArrowUp v-if="props.metric.trend.direction === 'up'" class="size-3" aria-hidden="true" /><ArrowDown v-else class="size-3" aria-hidden="true" />{{ Math.abs(props.metric.trend.value) }}%
      </span>
    </span>
    <span v-if="props.metric.subtext !== undefined" dir="auto" class="text-xs text-muted">{{ props.metric.subtext }}</span>
  </span>
</template>
