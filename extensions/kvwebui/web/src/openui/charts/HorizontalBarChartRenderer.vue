<script setup lang="ts">
import type { ComponentRenderProps } from '@openuidev/vue-lang';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { HorizontalBarChartProps } from '../definitions/charts.ts';
import CartesianChart from './CartesianChart.vue';
import { categoryData } from './chart-data.ts';

// OpenUI's HorizontalBarChart (plan 06 §6.1, ADR 0124, 9).
const component = defineProps<ComponentRenderProps<HorizontalBarChartProps>>();
const { t } = useI18n();
const data = computed(() => categoryData(component.props.labels, component.props.series));
</script>

<template>
  <CartesianChart :label="t('kvwebui.openui.chart.horizontalBarChart')" :data="data" kind="bar" :horizontal="true" :stacked="component.props.variant === 'stacked'" :height="Math.max(120, 48 + data.labels.length * 36)" :x-label="component.props.xLabel" :y-label="component.props.yLabel" />
</template>
