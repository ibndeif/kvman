// A chart's data as OpenUI's charts read it (plan 06 §6.1, ADR 0124, 9), from `buildChartData` of `@openuidev/react-ui`:
// labels with `Series` elements, each value in its label's place (and a scatter chart's `ScatterSeries` of `Point`s). OpenUI's tabular rows come only from a query's
// results, and OpenUI Lang 0.5 leaves rows out of `series`, so they never reach a chart here. A value that isn't a
// finite number reads as 0.

export type SeriesData = { name: string; values: number[] };
export type CategoryData = { labels: string[]; series: SeriesData[] };
export type ValueData = { label: string; value: number };
export type ScatterData = { name: string; points: { x: number; y: number }[] };

const finite = (value: unknown): number => {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : 0;
};

const asList = (value: unknown): unknown[] => (Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]);

// A parsed element's props (`{ type: 'element', props }`).
function propsOf(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Reflect.get(value, 'type') !== 'element') return undefined;
  const props: unknown = Reflect.get(value, 'props');
  return typeof props === 'object' && props !== null ? Object.fromEntries(Object.entries(props)) : undefined;
}

/** The labels and series of a bar, line, area, or radar chart. */
export function categoryData(labels: unknown, series: unknown): CategoryData {
  const names = asList(labels).map(String);
  const named = asList(series).flatMap((row) => {
    const props = propsOf(row);
    const category = props?.['category'];
    const values = props?.['values'];
    return typeof category === 'string' && Array.isArray(values) ? [{ name: category, values: names.map((_, index) => finite(values[index])) }] : [];
  });
  return { labels: names, series: named };
}

/** The labelled values of a pie, radial, or single stacked bar chart; a value below 0 counts as 0 where `positive`. */
export function valueData(labels: unknown, values: unknown, positive: boolean): ValueData[] {
  const numbers = asList(values);
  return asList(labels).map((label, index) => {
    const value = finite(numbers[index]);
    return { label: String(label), value: positive ? Math.max(0, value) : value };
  });
}

/** The named point sets of a scatter chart. */
export function scatterData(datasets: unknown): ScatterData[] {
  return asList(datasets).flatMap((dataset) => {
    const props = propsOf(dataset);
    if (props === undefined) return [];
    const points = asList(props['points']).flatMap((point) => {
      const coordinates = propsOf(point);
      return coordinates === undefined ? [] : [{ x: finite(coordinates['x']), y: finite(coordinates['y']) }];
    });
    return [{ name: String(props['name'] ?? ''), points }];
  });
}

/** The CSS color of the series or slice at `index`: the theme's eight chart colors, in turn. */
export const chartColor = (index: number): string => `var(--kv-color-chart-${String((index % 8) + 1)})`;

/** A number as an axis or a title shows it, with Western digits in every language. */
export const chartNumber = (value: number): string => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2, notation: Math.abs(value) >= 10_000 ? 'compact' : 'standard' }).format(value);
