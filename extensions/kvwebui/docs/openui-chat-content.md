# Content

CardHeader(title?: string, subtitle?: string) — Header with optional title and subtitle
TextContent(text: string, size?: "small" | "default" | "large" | "small-heavy" | "large-heavy") — Text block. Supports markdown. Optional size: "small" | "default" | "large" | "small-heavy" | "large-heavy".
MarkDownRenderer(textMarkdown: string, variant?: "clear" | "card" | "sunk") — Renders markdown text with optional container variant
Callout(variant: "info" | "warning" | "error" | "success" | "neutral", title: string, description: string, visible?: $binding<boolean>) — Callout banner. Optional visible is a reactive $boolean — auto-dismisses after 3s by setting $visible to false.
TextCallout(variant?: "neutral" | "info" | "warning" | "success" | "danger", title?: string, description?: string) — Text callout with variant, title, and description
CodeBlock(language: string, codeString: string) — Syntax-highlighted code block
Separator(orientation?: "horizontal" | "vertical", decorative?: boolean) — Visual divider between content sections
InlineHeader(heading: string, description?: string) — Compact section heading with an optional one-line description, for use inside cards.
- InlineHeader is a compact heading + description pair for labelling a block inside the response (lighter than CardHeader).
- Pass sources on Card ([{ title, sourceName, url }]) when the answer relies on references, and cite them inline in TextContent as [1], [2] (1-based index into sources). A Sources strip renders at the bottom of the card.
