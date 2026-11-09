<script setup lang="ts">
import type { ComponentRenderProps } from '@openuidev/vue-lang';
import { arc } from 'd3-shape';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ValuesChartProps } from '../definitions/charts.ts';
import { chartColor, chartNumber, valueData } from './chart-data.ts';
import ChartFrame from './ChartFrame.vue';
import { chartWidth } from './cartesian-geometry.ts';
import { useRightToLeft } from './direction.ts';

// OpenUI's RadialChart (plan 06 §6.1, ADR 0124, 9): one ring per value, the largest a full turn and the others in
// proportion, clockwise from the top (counter-clockwise right to left); a value below 0 counts as 0.
const component = defineProps<ComponentRenderProps<ValuesChartProps>>();
const { t } = useI18n();
const rightToLeft = useRightToLeft();
const height = 260;
const data = computed(() => valueData(component.props.labels, component.props.values, true));
const largest = computed(() => Math.max(0, ...data.value.map((ring) => ring.value)));
const rings = computed(() => {
  const outer = height / 2 - 12;
  const width = Math.min(18, (outer * 0.7) / Math.max(1, data.value.length));
  return data.value.map((ring, index) => {
    const turn = (ring.value / largest.value) * 2 * Math.PI * (rightToLeft.value ? -1 : 1);
    const shape = arc().innerRadius(outer - (index + 1) * width + 2).outerRadius(outer - index * width).startAngle(0).endAngle(turn).cornerRadius(3);
    return { d: shape({ innerRadius: 0, outerRadius: 0, startAngle: 0, endAngle: turn }) ?? '', color: chartColor(index), title: `${ring.label}: ${chartNumber(ring.value)}` };
  });
});
</script>

<template>
  <ChartFrame v-if="largest > 0" :label="t('kvwebui.openui.chart.radialChart')" :height="height" :legend="data.map((ring) => ring.label)">
    <g :transform="`translate(${chartWidth / 2} ${height / 2})`">
      <path v-for="(ring, index) in rings" :key="index" :d="ring.d" :fill="ring.color" data-test="chart-mark">
        <title>{{ ring.title }}</title>
      </path>
    </g>
  </ChartFrame>
</template>
