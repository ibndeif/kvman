<script setup lang="ts">
import type { ComponentRenderProps } from '@openuidev/vue-lang';
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { CategoryChartProps } from '../definitions/charts.ts';
import CartesianChart from './CartesianChart.vue';
import { categoryData } from './chart-data.ts';

// OpenUI's BarChart (plan 06 §6.1, ADR 0124, 9).
const component = defineProps<ComponentRenderProps<CategoryChartProps>>();
const { t } = useI18n();
const data = computed(() => categoryData(component.props.labels, component.props.series));
</script>

<template>
  <CartesianChart :label="t('kvwebui.openui.chart.barChart')" :data="data" kind="bar" :horizontal="false" :stacked="component.props.variant === 'stacked'" :height="component.props.height" :x-label="component.props.xLabel" :y-label="component.props.yLabel" />
</template>
