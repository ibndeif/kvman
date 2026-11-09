# Layout

Stack(children: any[], direction?: "row" | "column", gap?: "none" | "xs" | "s" | "m" | "l" | "xl" | "2xl", align?: "start" | "center" | "end" | "stretch" | "baseline", justify?: "start" | "center" | "end" | "between" | "around" | "evenly", wrap?: boolean) — Flex container. direction: "row"|"column" (default "column"). gap: "none"|"xs"|"s"|"m"|"l"|"xl"|"2xl" (default "m"). align: "start"|"center"|"end"|"stretch"|"baseline". justify: "start"|"center"|"end"|"between"|"around"|"evenly".
Tabs(items: TabItem[]) — Tabbed container
TabItem(value: string, trigger: string, content: (TextContent | MarkDownRenderer | CardHeader | Callout | TextCallout | CodeBlock | Separator | TagBlock | Form | Buttons | IconButton | Steps | InlineHeader)[]) — value is unique id, trigger is tab label, content is array of components
Accordion(items: AccordionItem[]) — Collapsible sections
AccordionItem(value: string, trigger: string, content: (TextContent | MarkDownRenderer | CardHeader | Callout | TextCallout | CodeBlock | Separator | TagBlock | Form | Buttons | IconButton | Steps | InlineHeader)[]) — value is unique id, trigger is section title
Steps(items: StepsItem[]) — Step-by-step guide
StepsItem(title: string, details: string) — title and details text for one step
Separator(orientation?: "horizontal" | "vertical", decorative?: boolean) — Visual divider between content sections
- For grid-like layouts, use Stack with direction "row" and wrap set to true.
- Prefer justify "start" (or omit justify) with wrap=true for stable columns instead of uneven gutters.
- Use nested Stacks when you need explicit rows/sections.
- Show/hide sections: $editId != "" ? Card([editForm]) : null
- Use Tabs for alternative views (chart types, data sections) — no $variable needed
