# Data Display

TagBlock(tags: string[], size?: "sm" | "md" | "lg") — tags is an array of strings; optional size sm | md | lg
Tag(text: string, icon?: Icon, size?: "sm" | "md" | "lg", variant?: "neutral" | "info" | "success" | "warning" | "danger") — Styled tag/badge with optional Icon and variant
EntityList(rows?: {left: string, right: string, rightVariant?: "text" | "number"}[], size?: "small" | "default", header?: {left: string, right: string, rightVariant?: "text" | "number"}, footer?: {left: string, right: string, rightVariant?: "text" | "number"}) — Two-column key/value rows (left label, right value). size 'default' supports optional header and footer rows; rightVariant 'number' uses tabular numbers.
- EntityList is a compact two-column list of { left, right } rows (e.g. name / value). size='default' also supports a header and footer row; size='small' does not.
