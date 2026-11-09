<script setup lang="ts">
import type { ComponentRenderProps } from '@openuidev/vue-lang';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { ValuesChartProps } from '../definitions/charts.ts';
import { chartColor, chartNumber, valueData } from './chart-data.ts';
import ChartFrame from './ChartFrame.vue';
import { chartWidth } from './cartesian-geometry.ts';
import { useRightToLeft } from './direction.ts';

// OpenUI's SingleStackedBarChart (plan 06 §6.1, ADR 0124, 9): one bar across, split in proportion to the values, from
// the inline start; a value below 0 counts as 0.
const component = defineProps<ComponentRenderProps<ValuesChartProps>>();
const { t } = useI18n();
const rightToLeft = useRightToLeft();
const height = 40;
const data = computed(() => valueData(component.props.labels, component.props.values, true));
const total = computed(() => data.value.reduce((sum, part) => sum + part.value, 0));
const parts = computed(() => {
  let start = 0;
  return data.value.map((part, index) => {
    const width = (part.value / total.value) * chartWidth;
    const x = rightToLeft.value ? chartWidth - start - width : start;
    start += width;
    return { x, width, color: chartColor(index), title: `${part.label}: ${chartNumber(part.value)} (${chartNumber((part.value / total.value) * 100)}%)` };
  });
});
</script>

<template>
  <ChartFrame v-if="total > 0" :label="t('kvwebui.openui.chart.singleStackedBarChart')" :height="height" :legend="data.map((part) => part.label)">
    <rect v-for="(part, index) in parts" :key="index" :x="part.x" y="4" :width="part.width" :height="height - 8" :fill="part.color" data-test="chart-mark">
      <title>{{ part.title }}</title>
    </rect>
  </ChartFrame>
</template>
