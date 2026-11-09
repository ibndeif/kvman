<script setup lang="ts">
import { chartColor } from './chart-data.ts';
import { chartWidth } from './cartesian-geometry.ts';

// A chart's frame (plan 06 §6.1, ADR 0124, 9 and 16): its SVG, named for assistive technology by its kind, its axis
// titles, and a legend when it has more than one series. Each mark inside carries a `<title>` with its value.
const props = defineProps<{ label: string; height: number; legend?: readonly string[] | undefined; xLabel?: string | undefined; yLabel?: string | undefined }>();
</script>

<template>
  <figure class="m-0 flex min-w-0 flex-col gap-2" data-test="openui-chart">
    <p v-if="props.yLabel !== undefined" dir="auto" class="m-0 text-xs text-muted" data-test="chart-y-label">{{ props.yLabel }}</p>
    <svg :viewBox="`0 0 ${chartWidth} ${props.height}`" role="img" :aria-label="props.label" class="block h-auto w-full overflow-visible" preserveAspectRatio="xMidYMid meet">
      <slot />
    </svg>
    <p v-if="props.xLabel !== undefined" dir="auto" class="m-0 text-center text-xs text-muted" data-test="chart-x-label">{{ props.xLabel }}</p>
    <figcaption v-if="props.legend !== undefined && props.legend.length > 1" class="flex flex-wrap gap-x-4 gap-y-1 text-xs" data-test="chart-legend">
      <span v-for="(name, index) in props.legend" :key="index" class="inline-flex items-center gap-1.5">
        <span class="inline-block size-2.5 rounded-sm" :style="{ background: chartColor(index) }" aria-hidden="true" />
        <span dir="auto">{{ name }}</span>
      </span>
    </figcaption>
  </figure>
</template>
