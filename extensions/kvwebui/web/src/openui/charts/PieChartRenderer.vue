<script setup lang="ts">
import type { ComponentRenderProps } from '@openuidev/vue-lang';
import { arc, pie, type PieArcDatum } from 'd3-shape';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { PieChartProps } from '../definitions/charts.ts';
import { chartColor, chartNumber, valueData, type ValueData } from './chart-data.ts';
import ChartFrame from './ChartFrame.vue';
import { chartWidth } from './cartesian-geometry.ts';

// OpenUI's PieChart (plan 06 §6.1, ADR 0124, 9): slices in proportion to their values, a full circle or its upper half,
// filled or as a donut; a value below 0 counts as 0, and a chart whose values sum to 0 draws nothing.
const component = defineProps<ComponentRenderProps<PieChartProps>>();
const { t } = useI18n();
const height = 260;
const semi = computed(() => component.props.appearance === 'semiCircular');
const data = computed(() => valueData(component.props.labels, component.props.values, true));
const total = computed(() => data.value.reduce((sum, slice) => sum + slice.value, 0));
const radius = computed(() => (semi.value ? height - 24 : height / 2 - 12));
const centerY = computed(() => (semi.value ? height - 12 : height / 2));
const slices = computed(() => {
  const angles = pie<ValueData>()
    .value((slice) => slice.value)
    .sort(null)
    .startAngle(semi.value ? -Math.PI / 2 : 0)
    .endAngle(semi.value ? Math.PI / 2 : 2 * Math.PI)(data.value);
  const shape = arc<PieArcDatum<ValueData>>().innerRadius(component.props.variant === 'donut' ? radius.value * 0.6 : 0).outerRadius(radius.value);
  return angles.map((angle, index) => ({
    d: shape(angle) ?? '',
    color: chartColor(index),
    angle: angle.endAngle - angle.startAngle,
    title: `${angle.data.label}: ${chartNumber(angle.data.value)} (${chartNumber((angle.data.value / total.value) * 100)}%)`,
  }));
});
</script>

<template>
  <ChartFrame v-if="total > 0" :label="t('kvwebui.openui.chart.pieChart')" :height="height" :legend="data.map((slice) => slice.label)">
    <g :transform="`translate(${chartWidth / 2} ${centerY})`">
      <path v-for="(slice, index) in slices" :key="index" :d="slice.d" :fill="slice.color" stroke="var(--kv-color-surface)" stroke-width="1.5" :data-angle="slice.angle" data-test="chart-mark">
        <title>{{ slice.title }}</title>
      </path>
    </g>
  </ChartFrame>
</template>
