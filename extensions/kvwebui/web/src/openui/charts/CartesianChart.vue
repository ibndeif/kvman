<script setup lang="ts">
import { computed } from 'vue';
import { cartesian } from './cartesian-geometry.ts';
import type { CategoryData } from './chart-data.ts';
import ChartFrame from './ChartFrame.vue';
import { useRightToLeft } from './direction.ts';

// A bar, horizontal bar, line, or area chart (plan 06 §6.1, ADR 0124, 9): grid lines and value ticks, category labels,
// the zero line, and the marks. Nothing is drawn for a chart with no category or no series, as OpenUI's draw nothing.
const props = defineProps<{
  label: string;
  data: CategoryData;
  kind: 'bar' | 'line' | 'area';
  horizontal?: boolean | undefined;
  stacked?: boolean | undefined;
  curve?: 'linear' | 'natural' | 'step' | undefined;
  height?: number | undefined;
  xLabel?: string | undefined;
  yLabel?: string | undefined;
}>();
const rightToLeft = useRightToLeft();
const drawn = computed(() => props.data.labels.length > 0 && props.data.series.length > 0);
const plot = computed(() =>
  cartesian({ data: props.data, kind: props.kind, horizontal: props.horizontal === true, stacked: props.stacked === true, curve: props.curve ?? 'linear', height: props.height ?? 260, rightToLeft: rightToLeft.value }),
);
// Value ticks sit outside the plot on the value axis's side; category labels outside on the other axis.
const valueAnchor = computed(() => (rightToLeft.value ? 'start' : 'end'));
const valueX = computed(() => (rightToLeft.value ? plot.value.plot.x1 + 6 : plot.value.plot.x0 - 6));
const categoryAnchor = computed(() => (rightToLeft.value ? 'start' : 'end'));
const categoryX = computed(() => (rightToLeft.value ? plot.value.plot.x1 + 8 : plot.value.plot.x0 - 8));
</script>

<template>
  <ChartFrame v-if="drawn" :label="props.label" :height="plot.height" :legend="props.data.series.map((series) => series.name)" :x-label="props.xLabel" :y-label="props.yLabel">
    <g class="text-muted" fill="currentColor" font-size="11" direction="ltr">
      <template v-if="plot.horizontal">
        <line v-for="tick in plot.valueTicks" :key="`grid-${tick.text}`" :x1="tick.at" :x2="tick.at" :y1="plot.plot.y0" :y2="plot.plot.y1" stroke="var(--kv-color-border)" stroke-dasharray="2 3" />
        <text v-for="tick in plot.valueTicks" :key="`value-${tick.text}`" :x="tick.at" :y="plot.plot.y1 + 16" text-anchor="middle">{{ tick.text }}</text>
        <text v-for="(tick, index) in plot.categoryTicks" :key="`category-${index}`" :x="categoryX" :y="tick.at" :text-anchor="categoryAnchor" dominant-baseline="middle" unicode-bidi="plaintext">{{ tick.text }}</text>
        <line :x1="plot.zero" :x2="plot.zero" :y1="plot.plot.y0" :y2="plot.plot.y1" stroke="var(--kv-color-muted)" data-test="chart-zero" />
      </template>
      <template v-else>
        <line v-for="tick in plot.valueTicks" :key="`grid-${tick.text}`" :x1="plot.plot.x0" :x2="plot.plot.x1" :y1="tick.at" :y2="tick.at" stroke="var(--kv-color-border)" stroke-dasharray="2 3" />
        <text v-for="tick in plot.valueTicks" :key="`value-${tick.text}`" :x="valueX" :y="tick.at" :text-anchor="valueAnchor" dominant-baseline="middle" data-test="chart-value-tick">{{ tick.text }}</text>
        <text v-for="(tick, index) in plot.categoryTicks" :key="`category-${index}`" :x="tick.at" :y="plot.plot.y1 + 16" text-anchor="middle" unicode-bidi="plaintext" data-test="chart-category">{{ tick.text }}</text>
        <line :x1="plot.plot.x0" :x2="plot.plot.x1" :y1="plot.zero" :y2="plot.zero" stroke="var(--kv-color-muted)" data-test="chart-zero" />
      </template>
    </g>
    <rect v-for="(rect, index) in plot.rects" :key="`rect-${index}`" :x="rect.x" :y="rect.y" :width="rect.width" :height="rect.height" :fill="rect.color" rx="2" data-test="chart-mark">
      <title>{{ rect.title }}</title>
    </rect>
    <path v-for="(path, index) in plot.paths" :key="`path-${index}`" :d="path.d" :fill="path.fill ? path.color : 'none'" :fill-opacity="path.fill ? 0.18 : undefined" :stroke="path.fill ? 'none' : path.color" stroke-width="2" />
    <circle v-for="(dot, index) in plot.dots" :key="`dot-${index}`" :cx="dot.x" :cy="dot.y" r="3.5" :fill="dot.color" data-test="chart-mark">
      <title>{{ dot.title }}</title>
    </circle>
  </ChartFrame>
</template>
