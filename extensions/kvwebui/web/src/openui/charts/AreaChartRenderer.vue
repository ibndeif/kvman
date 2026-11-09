<script setup lang="ts">
import type { ComponentRenderProps } from '@openuidev/vue-lang';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { LineChartProps } from '../definitions/charts.ts';
import CartesianChart from './CartesianChart.vue';
import { categoryData } from './chart-data.ts';

// OpenUI's AreaChart (plan 06 §6.1, ADR 0124, 9).
const component = defineProps<ComponentRenderProps<LineChartProps>>();
const { t } = useI18n();
const data = computed(() => categoryData(component.props.labels, component.props.series));
</script>

<template>
  <CartesianChart :label="t('kvwebui.openui.chart.areaChart')" :data="data" kind="area" :horizontal="false" :curve="component.props.variant" :height="component.props.height" :x-label="component.props.xLabel" :y-label="component.props.yLabel" />
</template>
