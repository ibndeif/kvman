import { describe, expect, it } from 'vitest';
import { mountOpenui } from './support/openui-page.ts';

const two = '[Series("Views", [10, 20, 30]), Series("Users", [5, 8, 12])]';
const every = [
  'root = Stack([grouped, stacked, across, linear, natural, step, filled, radar, pie, donut, half, radial, single, scatter])',
  `grouped = BarChart(["Mon", "Tue", "Wed"], ${two}, "grouped", "Day", "Count")`,
  `stacked = BarChart(["Mon", "Tue", "Wed"], ${two}, "stacked")`,
  `across = HorizontalBarChart(["Mon", "Tue", "Wed"], ${two})`,
  `linear = LineChart(["Mon", "Tue", "Wed"], ${two})`,
  'natural = LineChart(["Mon", "Tue", "Wed"], [Series("Views", [1, 4, 2])], "natural")',
  'step = LineChart(["Mon", "Tue", "Wed"], [Series("Views", [1, 4, 2])], "step")',
  'filled = AreaChart(["Mon", "Tue", "Wed"], [Series("Views", [1, 4, 2])])',
  'radar = RadarChart(["Speed", "Cost", "Scale"], [Series("Ours", [3, 4, 5])])',
  'pie = PieChart(["A", "B", "C"], [1, 2, 3])',
  'donut = PieChart(["A", "B"], [1, 1], "donut")',
  'half = PieChart(["A", "B", "C"], [1, 2, 3], "pie", "semiCircular")',
  'radial = RadialChart(["A", "B"], [4, 2])',
  'single = SingleStackedBarChart(["A", "B"], [3, 1])',
  'scatter = ScatterChart([ScatterSeries("Group", [Point(1, 2), Point(3, 4), Point(5, 1)])], "Size", "Price")',
].join('\n');

const charts = (root: HTMLElement): HTMLElement[] => [...root.querySelectorAll<HTMLElement>('[data-test="openui-chart"]')];
const marks = (chart: HTMLElement | undefined): Element[] => [...(chart?.querySelectorAll('[data-test="chart-mark"]') ?? [])];
const angles = (chart: HTMLElement | undefined): number[] => marks(chart).map((mark) => Number(mark.getAttribute('data-angle')));

describe('OpenUI charts (06 §6.1, ADR 0124, 9)', () => {
  it('M5.19-H4 each chart draws its marks in the theme colors, with a label, titles, a legend, and axis titles', async () => {
    const { app } = await mountOpenui(every);
    const drawn = charts(app.root);
    expect(drawn.map((chart) => chart.querySelector('svg')?.getAttribute('aria-label'))).toEqual([
      'Bar chart', 'Bar chart', 'Horizontal bar chart', 'Line chart', 'Line chart', 'Line chart', 'Area chart', 'Radar chart', 'Pie chart', 'Pie chart', 'Pie chart', 'Radial chart', 'Stacked bar', 'Scatter chart',
    ]);
    for (const chart of drawn) expect(chart.querySelector('svg')?.getAttribute('role')).toBe('img');
    expect(drawn.map((chart) => marks(chart).length)).toEqual([6, 6, 6, 6, 3, 3, 3, 3, 3, 2, 3, 2, 2, 3]);
    expect(marks(drawn[0]).map((mark) => mark.getAttribute('fill'))).toEqual(['var(--kv-color-chart-1)', 'var(--kv-color-chart-2)', 'var(--kv-color-chart-1)', 'var(--kv-color-chart-2)', 'var(--kv-color-chart-1)', 'var(--kv-color-chart-2)']);
    expect(marks(drawn[0])[0]?.querySelector('title')?.textContent).toBe('Mon · Views: 10');
    expect(drawn[0]?.querySelector('[data-test="chart-legend"]')?.textContent).toContain('Views');
    expect(drawn[0]?.querySelector('[data-test="chart-legend"]')?.textContent).toContain('Users');
    expect(drawn[4]?.querySelector('[data-test="chart-legend"]')).toBeNull();
    expect(drawn[0]?.querySelector('[data-test="chart-x-label"]')?.textContent).toBe('Day');
    expect(drawn[0]?.querySelector('[data-test="chart-y-label"]')?.textContent).toBe('Count');
    expect(drawn[13]?.querySelector('[data-test="chart-x-label"]')?.textContent).toBe('Size');
    expect(drawn[3]?.querySelectorAll('path').length).toBe(2);
    expect(drawn[6]?.querySelector('path[fill-opacity]')).not.toBeNull();
    expect(drawn[7]?.querySelector('[data-test="chart-shape"]')).not.toBeNull();
    const stacked = marks(drawn[1]).map((mark) => [Number(mark.getAttribute('x')), Number(mark.getAttribute('width'))]);
    expect(stacked[0]).toEqual(stacked[1]);
  });

  it("M5.19-H5 a pie's slices sum to its circle, in proportion; a semi-circle's to half of it", async () => {
    const { app } = await mountOpenui(every);
    const [pie, , half] = charts(app.root).filter((chart) => chart.querySelector('svg')?.getAttribute('aria-label') === 'Pie chart');
    const full = angles(pie);
    expect(full.reduce((sum, angle) => sum + angle, 0)).toBeCloseTo(2 * Math.PI, 6);
    expect(full.map((angle) => angle / (full[0] ?? 1))).toEqual([1, expect.closeTo(2, 6), expect.closeTo(3, 6)]);
    expect(angles(half).reduce((sum, angle) => sum + angle, 0)).toBeCloseTo(Math.PI, 6);
  });

  it('M5.19-E1 a chart with no data, a negative value, or one point draws without an error', async () => {
    const source = [
      'root = Stack([empty, negative, one, nothing, minus, none])',
      'empty = BarChart([], [Series("A", [])])',
      'negative = BarChart(["Up", "Down"], [Series("A", [4, -2])])',
      'one = LineChart(["Only"], [Series("A", [7])])',
      'nothing = PieChart([], [])',
      'minus = PieChart(["A", "B"], [3, -1])',
      'none = ScatterChart([])',
    ].join('\n');
    const { app } = await mountOpenui(source);
    const drawn = charts(app.root);
    expect(drawn.map((chart) => chart.querySelector('svg')?.getAttribute('aria-label'))).toEqual(['Bar chart', 'Line chart', 'Pie chart']);
    const [negative, one, minus] = drawn;
    const zero = Number(negative?.querySelector('[data-test="chart-zero"]')?.getAttribute('y1'));
    const [up, down] = marks(negative).map((mark) => ({ y: Number(mark.getAttribute('y')), height: Number(mark.getAttribute('height')) }));
    expect((up?.y ?? 0) + (up?.height ?? 0)).toBeCloseTo(zero, 6);
    expect(down?.y).toBeCloseTo(zero, 6);
    expect(marks(one)).toHaveLength(1);
    expect(marks(one)[0]?.tagName.toLowerCase()).toBe('circle');
    expect(angles(minus)).toEqual([expect.closeTo(2 * Math.PI, 6), 0]);
  });

  it('M5.19-E2 series given as rows are left out, and the rest of the block draws', async () => {
    const { app } = await mountOpenui('root = Stack([chart, note])\nchart = BarChart(["day", "views", "users"], [["Mon", 100, 50], ["Tue", 200, 75]])\nnote = TextContent("Still here")');
    expect(charts(app.root)).toEqual([]);
    expect(app.text()).toContain('Still here');
  });
});
