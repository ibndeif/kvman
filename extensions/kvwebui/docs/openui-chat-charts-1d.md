# Charts (1D)

PieChart(labels: string[], values: number[], variant?: "pie" | "donut", appearance?: "circular" | "semiCircular") — Circular slices; use plucked arrays: PieChart(data.categories, data.values)
RadialChart(labels: string[], values: number[]) — Radial bars; use plucked arrays: RadialChart(data.categories, data.values)
SingleStackedBarChart(labels: string[], values: number[]) — Single horizontal stacked bar; use plucked arrays: SingleStackedBarChart(data.categories, data.values)
Slice(category: string, value: number) — One slice with label and numeric value
