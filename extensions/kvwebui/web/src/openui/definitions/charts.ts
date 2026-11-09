import { z } from 'zod/v4';
import { defineOpenuiComponent } from './define.ts';

// OpenUI's chart components (plan 06 §6.1, ADR 0124, 4, 9, 11): OpenUI's names, schemas, and descriptions. A series,
// a slice, and a point are components of their own, as OpenUI defines them, so a chart's props hold their elements.

export const series = defineOpenuiComponent('Series', z.object({ category: z.string(), values: z.array(z.number()) }), 'One data series');

export const slice = defineOpenuiComponent('Slice', z.object({ category: z.string(), value: z.number() }), 'One slice with label and numeric value');

export const point = defineOpenuiComponent('Point', z.object({ x: z.number(), y: z.number(), z: z.number().optional() }), 'Data point with numeric coordinates');

export const scatterSeries = defineOpenuiComponent('ScatterSeries', z.object({ name: z.string(), points: z.array(point.props) }), 'Named dataset');

const axes = { xLabel: z.string().optional(), yLabel: z.string().optional() };

export const barChart = defineOpenuiComponent(
  'BarChart',
  z.object({ labels: z.array(z.string()), series: z.array(series.props), variant: z.enum(['grouped', 'stacked']).optional(), ...axes, height: z.number().optional() }),
  'Vertical bars; use for comparing values across categories with one or more series',
);

export const lineChart = defineOpenuiComponent(
  'LineChart',
  z.object({ labels: z.array(z.string()), series: z.array(series.props), variant: z.enum(['linear', 'natural', 'step']).optional(), ...axes, height: z.number().optional() }),
  'Lines over categories; use for trends and continuous data over time',
);

export const areaChart = defineOpenuiComponent(
  'AreaChart',
  z.object({ labels: z.array(z.string()), series: z.array(series.props), variant: z.enum(['linear', 'natural', 'step']).optional(), ...axes, height: z.number().optional() }),
  'Filled area under lines; use for cumulative totals or volume trends over time',
);

export const radarChart = defineOpenuiComponent(
  'RadarChart',
  z.object({ labels: z.array(z.string()), series: z.array(series.props) }),
  'Spider/web chart; use for comparing multiple variables across one or more entities',
);

export const horizontalBarChart = defineOpenuiComponent(
  'HorizontalBarChart',
  z.object({ labels: z.array(z.string()), series: z.array(series.props), variant: z.enum(['grouped', 'stacked']).optional(), ...axes }),
  'Horizontal bars; prefer when category labels are long or for ranked lists',
);

export const pieChart = defineOpenuiComponent(
  'PieChart',
  z.object({ labels: z.array(z.string()), values: z.array(z.number()), variant: z.enum(['pie', 'donut']).optional(), appearance: z.enum(['circular', 'semiCircular']).optional() }),
  'Circular slices; use plucked arrays: PieChart(data.categories, data.values)',
);

export const radialChart = defineOpenuiComponent(
  'RadialChart',
  z.object({ labels: z.array(z.string()), values: z.array(z.number()) }),
  'Radial bars; use plucked arrays: RadialChart(data.categories, data.values)',
);

export const singleStackedBarChart = defineOpenuiComponent(
  'SingleStackedBarChart',
  z.object({ labels: z.array(z.string()), values: z.array(z.number()) }),
  'Single horizontal stacked bar; use plucked arrays: SingleStackedBarChart(data.categories, data.values)',
);

export const scatterChart = defineOpenuiComponent(
  'ScatterChart',
  z.object({ datasets: z.array(scatterSeries.props), ...axes }),
  'X/Y scatter plot; use for correlations, distributions, and clustering',
);

export type CategoryChartProps = z.infer<typeof barChart.props>;
export type LineChartProps = z.infer<typeof lineChart.props>;
export type RadarChartProps = z.infer<typeof radarChart.props>;
export type HorizontalBarChartProps = z.infer<typeof horizontalBarChart.props>;
export type PieChartProps = z.infer<typeof pieChart.props>;
export type ValuesChartProps = z.infer<typeof radialChart.props>;
export type ScatterChartProps = z.infer<typeof scatterChart.props>;
