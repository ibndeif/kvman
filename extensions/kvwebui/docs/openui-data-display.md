# Data Display

TagBlock(tags: string[], size?: "sm" | "md" | "lg") — tags is an array of strings; optional size sm | md | lg
Tag(text: string, icon?: Icon, size?: "sm" | "md" | "lg", variant?: "neutral" | "info" | "success" | "warning" | "danger") — Styled tag/badge with optional Icon and variant
Icon(name: string, category?: string) — A lucide icon by kebab-case name (e.g. 'circle-check'). Optional category picks a topical fallback when the name doesn't resolve.
EntityList(rows?: {left: string, right: string, rightVariant?: "text" | "number"}[], size?: "small" | "default", header?: {left: string, right: string, rightVariant?: "text" | "number"}, footer?: {left: string, right: string, rightVariant?: "text" | "number"}) — Two-column key/value rows (left label, right value). size 'default' supports optional header and footer rows; rightVariant 'number' uses tabular numbers.
ListBlock(items: ListItem[], variant?: "number" | "image", size?: "default" | "small") — A list of items with number or image indicators. Each item can optionally have an action. size small renders a compact list.
ListItem(title: string, subtitle?: string, image?: {src: string, alt: string}, actionLabel?: string, action?: ActionExpression) — Item in a ListBlock — displays a title with an optional subtitle and image. When action is provided, the item becomes clickable.
- Color-mapped Tag: Tag(value, null, "sm", value == "high" ? "danger" : value == "medium" ? "warning" : "neutral")
- EntityList is a compact two-column list of { left, right } rows (e.g. name / value). size='default' also supports a header and footer row; size='small' does not.
- ListBlock is a numbered or image list of ListItem references. An action on ListItem is optional.
