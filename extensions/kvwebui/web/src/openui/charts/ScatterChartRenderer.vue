<script setup lang="ts">
import type { ComponentRenderProps } from '@openuidev/vue-lang';
import { scaleLinear } from 'd3-scale';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ScatterChartProps } from '../definitions/charts.ts';
import { chartColor, chartNumber, scatterData } from './chart-data.ts';
import ChartFrame from './ChartFrame.vue';
import { chartWidth } from './cartesian-geometry.ts';
import { useRightToLeft } from './direction.ts';

// OpenUI's ScatterChart (plan 06 §6.1, ADR 0124, 9): one dot per point, a color per dataset, both axes with ticks; right
// to left, x grows to the left and the y axis is on the right.
const component = defineProps<ComponentRenderProps<ScatterChartProps>>();
const { t } = useI18n();
const rightToLeft = useRightToLeft();
const height = 280;
const datasets = computed(() => scatterData(component.props.datasets));
const points = computed(() => datasets.value.flatMap((dataset) => dataset.points));
const plot = computed(() => ({ x0: rightToLeft.value ? 12 : 52, x1: chartWidth - (rightToLeft.value ? 52 : 12), y0: 12, y1: height - 28 }));
const span = (values: number[]): [number, number] => [Math.min(0, ...values), Math.max(0, ...values)];
const x = computed(() => scaleLinear().domain(span(points.value.map((point) => point.x))).nice().range(rightToLeft.value ? [plot.value.x1, plot.value.x0] : [plot.value.x0, plot.value.x1]));
const y = computed(() => scaleLinear().domain(span(points.value.map((point) => point.y))).nice().range([plot.value.y1, plot.value.y0]));
const dots = computed(() =>
  datasets.value.flatMap((dataset, index) => dataset.points.map((point) => ({ cx: x.value(point.x), cy: y.value(point.y), color: chartColor(index), title: `${dataset.name}: ${chartNumber(point.x)}, ${chartNumber(point.y)}` }))),
);
const yTextX = computed(() => (rightToLeft.value ? plot.value.x1 + 6 : plot.value.x0 - 6));
</script>

<template>
  <ChartFrame v-if="points.length > 0" :label="t('kvwebui.openui.chart.scatterChart')" :height="height" :legend="datasets.map((dataset) => dataset.name)" :x-label="component.props.xLabel" :y-label="component.props.yLabel">
    <g font-size="11" fill="var(--kv-color-muted)" direction="ltr">
      <g v-for="tick in y.ticks(5)" :key="`y-${tick}`">
        <line :x1="plot.x0" :x2="plot.x1" :y1="y(tick)" :y2="y(tick)" stroke="var(--kv-color-border)" stroke-dasharray="2 3" />
        <text :x="yTextX" :y="y(tick)" :text-anchor="rightToLeft ? 'start' : 'end'" dominant-baseline="middle">{{ chartNumber(tick) }}</text>
      </g>
      <text v-for="tick in x.ticks(6)" :key="`x-${tick}`" :x="x(tick)" :y="plot.y1 + 16" text-anchor="middle">{{ chartNumber(tick) }}</text>
    </g>
    <circle v-for="(dot, index) in dots" :key="index" :cx="dot.cx" :cy="dot.cy" r="4" :fill="dot.color" fill-opacity="0.85" data-test="chart-mark">
      <title>{{ dot.title }}</title>
    </circle>
  </ChartFrame>
</template>
