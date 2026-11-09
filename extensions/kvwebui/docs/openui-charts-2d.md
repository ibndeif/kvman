# Charts (2D)

BarChart(labels: string[], series: Series[], variant?: "grouped" | "stacked", xLabel?: string, yLabel?: string, height?: number) — Vertical bars; use for comparing values across categories with one or more series
LineChart(labels: string[], series: Series[], variant?: "linear" | "natural" | "step", xLabel?: string, yLabel?: string, height?: number) — Lines over categories; use for trends and continuous data over time
AreaChart(labels: string[], series: Series[], variant?: "linear" | "natural" | "step", xLabel?: string, yLabel?: string, height?: number) — Filled area under lines; use for cumulative totals or volume trends over time
RadarChart(labels: string[], series: Series[]) — Spider/web chart; use for comparing multiple variables across one or more entities
HorizontalBarChart(labels: string[], series: Series[], variant?: "grouped" | "stacked", xLabel?: string, yLabel?: string) — Horizontal bars; prefer when category labels are long or for ranked lists
Series(category: string, values: number[]) — One data series
- Charts accept column arrays: LineChart(labels, [Series("Name", values)]). Use array pluck: LineChart(items.day, [Series("Views", items.views)])
- Use Cards to wrap charts with CardHeader for titled sections
- Chart + Table from same source: use @Sort or @Filter result for both LineChart and Table Col data
- Multiple chart views: use Tabs — Tabs([TabItem("line", "Line", [LineChart(...)]), TabItem("bar", "Bar", [BarChart(...)])])
