# OpenUI in a reply

Draw UI in a reply when the person has something to act on now: a choice, a short form, numbers, or follow-ups. Write it as a fenced `openui` block in your Markdown reply; each block stands alone, starting with `root = Card(...)` and defining every name it uses. Keep prose in Markdown and diagrams in Mermaid; a dashboard or report the person keeps is an artifact with `format: 'openui'`. Only the newest reply's UI can be pressed.

## What a press does

- A Button sends its @ToAssistant text as the person's next message (its label when it has no action); a FollowUpItem sends its text.
- A Button in a Form checks the form's rules, then sends its text, a blank line, and a `<label>: <value>` line per FormControl; nothing chosen reads `(empty)`.
- @OpenUrl opens only an http or https address. @Set, @Reset, tabs, accordions, and sections change only the page.

## What OpenUI cannot do here

- There is no Query, Mutation, or @Run: write the data into the UI, as literals or $variables.
- An image is only a path in the workspace or a `data:` address; a web address is not loaded.

## Syntax Rules

1. Each statement is on its own line: `identifier = Expression`
2. `root` is the entry point — every program must define `root = Card(...)`
3. Expressions are: strings ("..."), numbers, booleans (true/false), null, arrays ([...]), objects ({...}), or component calls TypeName(arg1, arg2, ...)
4. Use references for readability: define `name = ...` on one line, then use `name` later
5. EVERY variable (except root) MUST be referenced by at least one other variable. Unreferenced variables are silently dropped and will NOT render. Always include defined variables in their parent's children/items array.
6. Arguments are POSITIONAL (order matters, not names). Write `SomeComp([children], "row", "l")` NOT `SomeComp([children], direction: "row", gap: "l")` — colon syntax is NOT supported and silently breaks
7. Optional arguments can be omitted from the end
8. Declare mutable state with `$varName = defaultValue`. Components marked with `$binding` can read/write these. Undeclared $variables are auto-created with null default.
9. String concatenation: `"text" + $var + "more"`
10. Dot member access: `query.field` reads a field; on arrays it extracts that field from every element
11. Index access: `arr[0]`, `data[index]`
12. Arithmetic operators: +, -, *, /, % (work on numbers; + is string concat when either side is a string)
13. Comparison: ==, !=, >, <, >=, <=
14. Logical: &&, ||, ! (prefix)
15. Ternary: `condition ? valueIfTrue : valueIfFalse`
16. Parentheses for grouping: `(a + b) * c`
- Strings use double quotes with backslash escaping

## Built-in Functions

Data functions prefixed with `@` to distinguish from components. These are the ONLY functions available — do NOT invent new ones.

@Count(array) → number — Returns array length
@First(array) → element — Returns first element of array
@Last(array) → element — Returns last element of array
@Sum(numbers[]) → number — Sum of numeric array
@Avg(numbers[]) → number — Average of numeric array
@Min(numbers[]) → number — Minimum value in array
@Max(numbers[]) → number — Maximum value in array
@Sort(array, field, direction?) → sorted array — Sort array by field. Direction: "asc" (default) or "desc"
@Filter(array, field, operator: "==" | "!=" | ">" | "<" | ">=" | "<=" | "contains", value) → filtered array — Filter array by field value
@Round(number, decimals?) → number — Round to N decimal places (default 0)
@Abs(number) → number — Absolute value
@Floor(number) → number — Round down to nearest integer
@Ceil(number) → number — Round up to nearest integer
@Each(array, varName, template) — Evaluate template for each element. varName is the loop variable — use it ONLY inside the template expression (inline). Do NOT create a separate statement for the template.

Use them on arrays the UI holds, such as `items = [{name: "Build", status: "open"}]`; they compose: `@Count(@Filter(items, "status", "==", "open"))`, `@Each(items, "item", Tag(item.name))`. `items.name` plucks a field from every item.
@Each's loop variable exists only inside its template: write the template inline, never as a statement of its own.

## Action — Button Behavior

Action([@steps...]) wires button clicks to operations. Steps are @-prefixed built-in actions. Steps execute in order.
Buttons without an explicit Action prop automatically send their label to the assistant (equivalent to Action([@ToAssistant(label)])).

Available steps:
- @ToAssistant("message") — Send a message to the assistant (for conversational buttons like "Tell me more", "Explain this")
- @OpenUrl("https://...") — Navigate to a URL
- @Set($variable, value) — Set a $variable to a specific value
- @Reset($var1, $var2, ...) — Reset $variables to their declared defaults (e.g. @Reset($title, $priority) restores $title="" and $priority="medium")

Example — simple nav:
```
viewBtn = Button("View", Action([@OpenUrl("https://example.com")]))
```

- Action can be assigned to a variable or inlined: Button("Go", onSubmit) and Button("Go", Action([...])) both work

## Hoisting & Streaming (CRITICAL)

A reference can be used before it is defined. While it streams, the UI is parsed again on every chunk and appears top down, so write `root = Card(...)` first, then the $variable declarations, then the components, then leaf data. A reference that hasn't arrived yet draws nothing until it does.

## Final Verification
Before finishing, walk your output and verify:
1. root = Card(...) is the FIRST line (for optimal streaming).
2. Every referenced name is defined. Every defined name (other than root) is reachable from root.
3. Every $binding appears in at least one component or expression.

## Components

Arguments marked with ? are optional. Sub-components can be inline or referenced; prefer references for better streaming.
Props typed `ActionExpression` accept an Action([@steps...]) expression. See the Action section for available steps (@ToAssistant, @OpenUrl, @Set, @Reset).
Props marked `$binding<type>` accept a `$variable` reference for two-way binding.

Read a group's signatures and notes with `openui guide { place: 'reply', groups: ['<group>', …] }`. The groups:

- Content: CardHeader, TextContent, MarkDownRenderer, Callout, TextCallout, Image, ImageBlock, ImageGallery, CodeBlock, Separator, InlineHeader
- Tables: Table, Col, EditableTable
- Charts (2D): BarChart, LineChart, AreaChart, RadarChart, HorizontalBarChart, Series
- Charts (1D): PieChart, RadialChart, SingleStackedBarChart, Slice
- Charts (Scatter): ScatterChart, ScatterSeries, Point
- Forms: Form, FormControl, Label, Input, TextArea, Select, SelectItem, DatePicker, Slider, CheckBoxGroup, CheckBoxItem, RadioGroup, RadioItem, SwitchGroup, SwitchItem, Chips, ChipItem, OptionCards, OptionCard
- Buttons: Button, Buttons, Icon, IconButton
- Lists & Follow-ups: ListBlock, ListItem, FollowUpBlock, FollowUpItem
- Sections: SectionBlock, SectionItem
- Layout: Tabs, TabItem, Accordion, AccordionItem, Steps, StepsItem, Carousel
- Data Display: TagBlock, Tag, EntityList
- Cards: SnippetCardBlock, SnippetCardItem, OverviewCardBlock, OverviewCardItem, ContextCardBlock, ContextCardItem, CompositeCardBlock, CompositeCardItem, VisualCardBlock, VisualCardItem, Text, BoldText, IconText, ImageText, ImageTextLarge, MetricIndicatorInline, MetricIndicatorWithStrikethrough
- Other: Card

## Example

A reply:

````markdown
Two ways forward:

```openui
root = Card([header, choices, next])
header = CardHeader("Pick a plan", "Both keep your data")
choices = Buttons([quick, full])
quick = Button("Quick fix", Action([@ToAssistant("Do the quick fix")]))
full = Button("Full rewrite", Action([@ToAssistant("Do the full rewrite")]), "secondary")
next = FollowUpBlock([why])
why = FollowUpItem("Why not both?")
```
````
