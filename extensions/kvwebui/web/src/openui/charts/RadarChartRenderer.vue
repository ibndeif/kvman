<script setup lang="ts">
import type { ComponentRenderProps } from '@openuidev/vue-lang';
import { scaleLinear } from 'd3-scale';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { RadarChartProps } from '../definitions/charts.ts';
import { chartColor, chartNumber, categoryData } from './chart-data.ts';
import ChartFrame from './ChartFrame.vue';
import { chartWidth } from './cartesian-geometry.ts';
import { useRightToLeft } from './direction.ts';

// OpenUI's RadarChart (plan 06 §6.1, ADR 0124, 9): one spoke per label, clockwise from the top (counter-clockwise right
// to left), four grid rings, and one filled polygon per series; values below 0 sit at the center.
const component = defineProps<ComponentRenderProps<RadarChartProps>>();
const { t } = useI18n();
const rightToLeft = useRightToLeft();
const height = 280;
const radius = height / 2 - 28;
const data = computed(() => categoryData(component.props.labels, component.props.series));
const scale = computed(() => scaleLinear().domain([0, Math.max(0, ...data.value.series.flatMap((series) => series.values))]).nice().range([0, radius]));
const angle = (index: number): number => ((rightToLeft.value ? -1 : 1) * 2 * Math.PI * index) / Math.max(1, data.value.labels.length);
const at = (index: number, distance: number): [number, number] => [Math.sin(angle(index)) * distance, -Math.cos(angle(index)) * distance];
const rings = computed(() => [1, 2, 3, 4].map((step) => data.value.labels.map((_, index) => at(index, (radius * step) / 4).join(',')).join(' ')));
const spokes = computed(() => data.value.labels.map((label, index) => ({ label, end: at(index, radius), text: at(index, radius + 14) })));
const shapes = computed(() =>
  data.value.series.map((series, index) => {
    const corners = series.values.map((value, position) => at(position, scale.value(Math.max(0, value))));
    return { points: corners.map((corner) => corner.join(',')).join(' '), corners, color: chartColor(index), titles: series.values.map((value, position) => `${data.value.labels[position] ?? ''} · ${series.name}: ${chartNumber(value)}`) };
  }),
);
</script>

<template>
  <ChartFrame v-if="data.labels.length > 0 && data.series.length > 0" :label="t('kvwebui.openui.chart.radarChart')" :height="height" :legend="data.series.map((series) => series.name)">
    <g :transform="`translate(${chartWidth / 2} ${height / 2})`">
      <polygon v-for="(ring, index) in rings" :key="`ring-${index}`" :points="ring" fill="none" stroke="var(--kv-color-border)" />
      <g v-for="(spoke, index) in spokes" :key="`spoke-${index}`">
        <line x1="0" y1="0" :x2="spoke.end[0]" :y2="spoke.end[1]" stroke="var(--kv-color-border)" />
        <text :x="spoke.text[0]" :y="spoke.text[1]" text-anchor="middle" dominant-baseline="middle" font-size="11" fill="var(--kv-color-muted)" unicode-bidi="plaintext">{{ spoke.label }}</text>
      </g>
      <g v-for="(shape, index) in shapes" :key="`shape-${index}`">
        <polygon :points="shape.points" :fill="shape.color" fill-opacity="0.2" :stroke="shape.color" stroke-width="2" data-test="chart-shape" />
        <circle v-for="(corner, position) in shape.corners" :key="position" :cx="corner[0]" :cy="corner[1]" r="3" :fill="shape.color" data-test="chart-mark">
          <title>{{ shape.titles[position] }}</title>
        </circle>
      </g>
    </g>
  </ChartFrame>
</template>
