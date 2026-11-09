# Buttons

Button(label: string, action?: ActionExpression, variant?: "primary" | "secondary" | "tertiary", type?: "normal" | "destructive", size?: "extra-small" | "small" | "medium" | "large") — Clickable button
Buttons(buttons: Button[], direction?: "row" | "column") — Group of Button components. direction: "row" (default) | "column".
Icon(name: string, category?: string) — A lucide icon by kebab-case name (e.g. 'circle-check'). Optional category picks a topical fallback when the name doesn't resolve.
IconButton(name: string, icon: Icon, action?: ActionExpression, variant?: "primary" | "secondary" | "tertiary", size?: "extra-small" | "small" | "medium" | "large", shape?: "square" | "circle") — Icon-only button. name is the accessible label and the action label; icon is an Icon; action fires on click.
