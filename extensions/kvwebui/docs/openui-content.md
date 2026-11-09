# Content

Card(children: (TextContent | MarkDownRenderer | CardHeader | Callout | TextCallout | CodeBlock | Image | ImageBlock | ImageGallery | Separator | HorizontalBarChart | RadarChart | PieChart | RadialChart | SingleStackedBarChart | ScatterChart | AreaChart | BarChart | LineChart | Table | TagBlock | Form | Buttons | IconButton | Steps | InlineHeader | EntityList | EditableTable | SnippetCardBlock | OverviewCardBlock | ContextCardBlock | CompositeCardBlock | VisualCardBlock | Tabs | Carousel | Stack)[], variant?: "card" | "sunk" | "clear", direction?: "row" | "column", gap?: "none" | "xs" | "s" | "m" | "l" | "xl" | "2xl", align?: "start" | "center" | "end" | "stretch" | "baseline", justify?: "start" | "center" | "end" | "between" | "around" | "evenly", wrap?: boolean) — Styled container. variant: "card" (default, elevated) | "sunk" (recessed) | "clear" (transparent). Always full width. Accepts all Stack flex params (default: direction "column"). Cards flex to share space in row/wrap layouts.
CardHeader(title?: string, subtitle?: string) — Header with optional title and subtitle
TextContent(text: string, size?: "small" | "default" | "large" | "small-heavy" | "large-heavy") — Text block. Supports markdown. Optional size: "small" | "default" | "large" | "small-heavy" | "large-heavy".
MarkDownRenderer(textMarkdown: string, variant?: "clear" | "card" | "sunk") — Renders markdown text with optional container variant
Callout(variant: "info" | "warning" | "error" | "success" | "neutral", title: string, description: string, visible?: $binding<boolean>) — Callout banner. Optional visible is a reactive $boolean — auto-dismisses after 3s by setting $visible to false.
TextCallout(variant?: "neutral" | "info" | "warning" | "success" | "danger", title?: string, description?: string) — Text callout with variant, title, and description
Image(alt: string, src?: string) — Image with alt text and optional URL
ImageBlock(src: string, alt?: string) — Image block with loading state
ImageGallery(images: {src: string, alt?: string, details?: string}[]) — Gallery grid of images with modal preview
CodeBlock(language: string, codeString: string) — Syntax-highlighted code block
InlineHeader(heading: string, description?: string) — Compact section heading with an optional one-line description, for use inside cards.
- InlineHeader is a compact heading + description pair for labelling a block (lighter than CardHeader).
- Use Cards to group related KPIs or sections. Stack with direction "row" for side-by-side layouts.
- KPI card: Card([TextContent("Label", "small"), TextContent("" + @Count(@Filter(items, "field", "==", "value")), "large-heavy")])
