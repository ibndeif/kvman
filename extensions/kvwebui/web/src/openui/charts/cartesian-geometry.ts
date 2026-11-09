import { scaleBand, scaleLinear, scalePoint } from 'd3-scale';
import { area, curveLinear, curveNatural, curveStep, line } from 'd3-shape';
import { chartColor, chartNumber, type CategoryData } from './chart-data.ts';

// The geometry of OpenUI's bar, horizontal bar, line, and area charts (plan 06 §6.1, ADR 0124, 9), computed with d3 in
// a 600-wide view box. Right to left, the categories run from the right and the value axis is on the right (or, for
// horizontal bars, the values grow to the left); numbers are written left to right either way.

export const chartWidth = 600;

export type Rect = { x: number; y: number; width: number; height: number; color: string; title: string };
export type Dot = { x: number; y: number; color: string; title: string };
export type Path = { d: string; color: string; fill: boolean };
export type Tick = { at: number; text: string };

export type Cartesian = {
  height: number;
  horizontal: boolean;
  plot: { x0: number; x1: number; y0: number; y1: number };
  zero: number;
  valueTicks: Tick[];
  categoryTicks: Tick[];
  rects: Rect[];
  paths: Path[];
  dots: Dot[];
};

export type CartesianInput = { data: CategoryData; kind: 'bar' | 'line' | 'area'; horizontal: boolean; stacked: boolean; curve: 'linear' | 'natural' | 'step'; height: number; rightToLeft: boolean };

const curves = { linear: curveLinear, natural: curveNatural, step: curveStep };

// The smallest and largest value the axis must show: each value, or each stack's totals, and always 0.
function extent(data: CategoryData, stacked: boolean): [number, number] {
  const values = stacked
    ? data.labels.flatMap((_, index) => {
        const column = data.series.map((series) => series.values[index] ?? 0);
        return [column.filter((value) => value > 0).reduce((sum, value) => sum + value, 0), column.filter((value) => value < 0).reduce((sum, value) => sum + value, 0)];
      })
    : data.series.flatMap((series) => series.values);
  return [Math.min(0, ...values), Math.max(0, ...values)];
}

const title = (label: string, series: string, value: number): string => `${label} · ${series}: ${chartNumber(value)}`;

/** The plot of a category chart: its axes' ticks and its bars, lines, areas, and dots. */
export function cartesian(input: CartesianInput): Cartesian {
  const { data, horizontal, stacked, rightToLeft } = input;
  const height = input.height;
  const startSide = horizontal ? 104 : 52;
  const plot = horizontal
    ? { x0: rightToLeft ? 16 : startSide, x1: chartWidth - (rightToLeft ? startSide : 16), y0: 8, y1: height - 28 }
    : { x0: rightToLeft ? 12 : startSide, x1: chartWidth - (rightToLeft ? startSide : 12), y0: 12, y1: height - 28 };
  const valueRange: [number, number] = horizontal ? (rightToLeft ? [plot.x1, plot.x0] : [plot.x0, plot.x1]) : [plot.y1, plot.y0];
  const value = scaleLinear().domain(extent(data, stacked)).nice().range(valueRange);
  const categoryRange: [number, number] = horizontal ? [plot.y0, plot.y1] : rightToLeft ? [plot.x1, plot.x0] : [plot.x0, plot.x1];
  const bands = scaleBand<string>().domain(data.labels.map((_, index) => String(index))).range(categoryRange).padding(0.2);
  const points = scalePoint<string>().domain(data.labels.map((_, index) => String(index))).range(categoryRange).padding(0.5);
  const center = (index: number): number => (input.kind === 'bar' ? (bands(String(index)) ?? 0) + bands.bandwidth() / 2 : (points(String(index)) ?? 0));
  const result: Cartesian = {
    height,
    horizontal,
    plot,
    zero: value(0),
    valueTicks: value.ticks(5).map((tick) => ({ at: value(tick), text: chartNumber(tick) })),
    categoryTicks: data.labels.map((label, index) => ({ at: center(index), text: label })),
    rects: [],
    paths: [],
    dots: [],
  };
  if (input.kind === 'bar') result.rects = bars(input, bands, value);
  else {
    const at = (index: number): number => points(String(index)) ?? 0;
    for (const [index, series] of data.series.entries()) {
      const color = chartColor(index);
      const drawn = line<number>().x((_, position) => at(position)).y((number) => value(number)).curve(curves[input.curve])(series.values) ?? '';
      if (input.kind === 'area') result.paths.push({ d: area<number>().x((_, position) => at(position)).y0(value(0)).y1((number) => value(number)).curve(curves[input.curve])(series.values) ?? '', color, fill: true });
      result.paths.push({ d: drawn, color, fill: false });
      result.dots.push(...series.values.map((number, position) => ({ x: at(position), y: value(number), color, title: title(data.labels[position] ?? '', series.name, number) })));
    }
  }
  return result;
}

type Band = ReturnType<typeof scaleBand<string>>;
type Linear = ReturnType<typeof scaleLinear<number>>;

// One rect per value: side by side within a category, or stacked from 0 (positive values up or out, negative ones down
// or in), as OpenUI's grouped and stacked variants are.
function bars(input: CartesianInput, bands: Band, value: Linear): Rect[] {
  const { data, horizontal, stacked, rightToLeft } = input;
  const inner = scaleBand<string>().domain(data.series.map((_, index) => String(index))).range(rightToLeft && !horizontal ? [bands.bandwidth(), 0] : [0, bands.bandwidth()]).padding(0.08);
  return data.labels.flatMap((label, position) => {
    let above = 0;
    let below = 0;
    return data.series.map((series, index) => {
      const number = series.values[position] ?? 0;
      const from = stacked ? (number >= 0 ? above : below) : 0;
      const to = from + number;
      if (stacked && number >= 0) above = to;
      else if (stacked) below = to;
      const band = (bands(String(position)) ?? 0) + (stacked ? 0 : (inner(String(index)) ?? 0));
      const thickness = stacked ? bands.bandwidth() : inner.bandwidth();
      const [low, high] = [Math.min(value(from), value(to)), Math.max(value(from), value(to))];
      const color = chartColor(index);
      const words = title(label, series.name, number);
      return horizontal ? { x: low, y: band, width: high - low, height: thickness, color, title: words } : { x: band, y: low, width: thickness, height: high - low, color, title: words };
    });
  });
}
