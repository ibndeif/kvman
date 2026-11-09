# Sections

SectionBlock(sections: SectionItem[], isFoldable?: boolean) — Collapsible accordion sections. Auto-opens sections as they stream in. Use SectionItem for each section.
SectionItem(value: string, trigger: string, content: (TextContent | MarkDownRenderer | CardHeader | Callout | TextCallout | CodeBlock | Separator | HorizontalBarChart | RadarChart | PieChart | RadialChart | SingleStackedBarChart | ScatterChart | AreaChart | BarChart | LineChart | Table | TagBlock | Form | Buttons | IconButton | Steps | InlineHeader | EntityList | EditableTable | ListBlock | FollowUpBlock | Tabs | Accordion)[]) — Section with a label and collapsible content — used inside SectionBlock
- SectionBlock renders collapsible accordion sections that auto-open as they stream.
- Each section needs a unique `value` id, a `trigger` label, and a `content` array.
- Example: sections = SectionBlock([s1, s2])  s1 = SectionItem("intro", "Introduction", [content1])
- Set isFoldable=false to render sections as flat headers instead of accordion.
